import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { generateSystemPrompt } from './server/prompt';
import dotenv from 'dotenv';
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  let aiClient: GoogleGenAI | null = null;
  
  function getGenAIClient(): GoogleGenAI {
    if (!aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is missing. Please configure it in the secrets settings.');
      }
      aiClient = new GoogleGenAI({ apiKey });
    }
    return aiClient;
  }

  // API POST route to handle chat
  app.post('/api/chat', async (req, res) => {
    try {
      const { messages, scenarioContext, provider = 'gemini', openRouterModel = 'deepseek/deepseek-chat', customApiKey } = req.body; 
      
      const systemPrompt = generateSystemPrompt(
        scenarioContext.scenarioDescription,
        scenarioContext.characters,
        scenarioContext.playerCharacterId,
        scenarioContext.gameMode,
        scenarioContext.options
      );

      if (provider === 'openrouter') {
        const apiKey = customApiKey || process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
          return res.status(400).json({ 
            error: 'OpenRouter API Key is missing. Please set OPENROUTER_API_KEY in your environment, or provide your own key in the Settings panel in-app.' 
          });
        }

        const formattedMessages = [
          { role: 'system', content: systemPrompt },
          ...messages.map((m: any) => ({
            role: m.role === 'model' ? 'assistant' : m.role,
            content: m.content
          }))
        ];

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://ai.studio/build',
            'X-Title': 'Eros Interactive Framework'
          },
          body: JSON.stringify({
            model: openRouterModel,
            messages: formattedMessages,
            temperature: 0.9,
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData?.error?.message || `OpenRouter API error (Status ${response.status})`);
        }

        const completion = await response.json();
        const text = completion.choices?.[0]?.message?.content || '';
        return res.json({ text });
      }

      const ai = getGenAIClient();
      
      const formattedMessages = messages.map((m: any) => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));

      // Define model fallback chain
      // If we used a specific model in the request, we'd start there. 
      // Since it's currently hardcoded, we'll start with 1.5 Pro and fall back.
      const modelChain = ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
      let lastError: any = null;

      for (const modelName of modelChain) {
        try {
          const model = ai.getGenerativeModel({
            model: modelName,
            systemInstruction: systemPrompt,
            safetySettings: [
              { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            ],
          });

          const response = await model.generateContent({
            contents: formattedMessages,
          });
          
          return res.json({ text: response.response.text(), model: modelName });
        } catch (err: any) {
          lastError = err;
          const statusCode = err?.status || err?.response?.status;
          console.warn(`Model ${modelName} failed (Status ${statusCode}):`, err.message);
          
          // Only fall back on rate limit (429) or certain server errors
          if (statusCode === 429 || statusCode === 503 || statusCode === 500) {
            continue;
          } else {
            break; // Stop for other errors (like invalid prompt)
          }
        }
      }
      
      throw lastError;
    } catch (err: any) {
      console.error('Chat error:', err);
      res.status(500).json({ error: err.message || 'An error occurred during generation.' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
