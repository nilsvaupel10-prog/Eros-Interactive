import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { generateSystemPrompt } from './server/prompt';
import dotenv from 'dotenv';

// README instructs users to configure .env.local, but dotenv only loads .env by
// default. Load .env.local first, then .env as a fallback without overriding
// already-defined deployment secrets.
dotenv.config({ path: '.env.local' });
dotenv.config();

type ChatRole = 'user' | 'model' | 'assistant' | 'system';

interface ChatMessagePayload {
  role: ChatRole;
  content: string;
}

interface ScenarioContextPayload {
  scenarioDescription: string;
  characters: { id?: string; name: string; definition: string }[];
  playerCharacterId: string;
  gameMode: 'standard' | 'free_will';
}

function isValidMessage(message: unknown): message is ChatMessagePayload {
  if (!message || typeof message !== 'object') return false;
  const candidate = message as Partial<ChatMessagePayload>;
  return (
    typeof candidate.content === 'string' &&
    candidate.content.trim().length > 0 &&
    (candidate.role === 'user' || candidate.role === 'model' || candidate.role === 'assistant' || candidate.role === 'system')
  );
}

function isValidScenarioContext(context: unknown): context is ScenarioContextPayload {
  if (!context || typeof context !== 'object') return false;
  const candidate = context as Partial<ScenarioContextPayload>;
  return (
    typeof candidate.scenarioDescription === 'string' &&
    Array.isArray(candidate.characters) &&
    candidate.characters.every(character => (
      character &&
      typeof character === 'object' &&
      typeof character.name === 'string' &&
      typeof character.definition === 'string'
    )) &&
    typeof candidate.playerCharacterId === 'string' &&
    (candidate.gameMode === 'standard' || candidate.gameMode === 'free_will')
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '1mb' }));

  let aiClient: GoogleGenAI | null = null;

  function getGenAIClient(): GoogleGenAI {
    if (!aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is missing. Please configure it in .env.local, .env, or your deployment secrets.');
      }
      aiClient = new GoogleGenAI({ apiKey });
    }
    return aiClient;
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // API POST route to handle chat
  app.post('/api/chat', async (req, res) => {
    try {
      const {
        messages,
        scenarioContext,
        provider = 'gemini',
        openRouterModel = 'deepseek/deepseek-chat',
        customApiKey,
      } = req.body ?? {};

      if (!Array.isArray(messages) || messages.some(message => !isValidMessage(message))) {
        return res.status(400).json({ error: 'Invalid request: messages must be an array of chat messages with role and content.' });
      }

      if (!isValidScenarioContext(scenarioContext)) {
        return res.status(400).json({ error: 'Invalid request: scenarioContext is missing or malformed.' });
      }

      if (provider !== 'gemini' && provider !== 'openrouter') {
        return res.status(400).json({ error: 'Invalid provider. Supported providers are gemini and openrouter.' });
      }

      const systemPrompt = generateSystemPrompt(
        scenarioContext.scenarioDescription,
        scenarioContext.characters,
        scenarioContext.playerCharacterId,
        scenarioContext.gameMode,
      );

      if (provider === 'openrouter') {
        const apiKey = typeof customApiKey === 'string' && customApiKey.trim()
          ? customApiKey.trim()
          : process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
          return res.status(400).json({
            error: 'OpenRouter API Key is missing. Please set OPENROUTER_API_KEY in your environment, or provide your own key in the Settings panel in-app.',
          });
        }

        const formattedMessages = [
          { role: 'system', content: systemPrompt },
          ...messages
            .filter(message => message.role !== 'system')
            .map(message => ({
              role: message.role === 'model' ? 'assistant' : message.role,
              content: message.content,
            })),
        ];

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
            'X-Title': 'Eros Interactive Framework',
          },
          body: JSON.stringify({
            model: typeof openRouterModel === 'string' && openRouterModel.trim()
              ? openRouterModel.trim()
              : 'deepseek/deepseek-chat',
            messages: formattedMessages,
            temperature: 0.9,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          const providerMessage = errorData?.error?.message || errorData?.message;
          throw new Error(providerMessage || `OpenRouter API error (Status ${response.status})`);
        }

        const completion = await response.json();
        const text = completion.choices?.[0]?.message?.content;
        return res.json({ text: typeof text === 'string' ? text : '' });
      }

      const ai = getGenAIClient();

      const formattedMessages = messages
        .filter(message => message.role === 'user' || message.role === 'model')
        .map(message => ({
          role: message.role,
          parts: [{ text: message.content }],
        }));

      if (formattedMessages.length === 0) {
        return res.status(400).json({ error: 'Invalid request: Gemini requires at least one user or model message.' });
      }

      const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

      const response = await ai.models.generateContent({
        model: modelName,
        contents: formattedMessages,
        config: {
          systemInstruction: systemPrompt,
          // We apply minimum block thresholds due to the strict guidelines of the specific interactive framework
          // (fictional interactive scenario with adult themes specifically requested by user).
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          ],
        },
      });

      res.json({ text: response.text ?? '' });
    } catch (err: unknown) {
      console.error('Chat error:', err);
      res.status(500).json({ error: getErrorMessage(err, 'An error occurred during generation.') });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err: unknown) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
