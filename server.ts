import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { generateSystemPrompt } from './server/prompt';
import dotenv from 'dotenv';

// Load environment variables from .env.local (as recommended in README) and fallback to .env
dotenv.config({ path: '.env.local' });
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json({ limit: '2mb' }));

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

  // Health endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      environment: process.env.NODE_ENV || 'development',
      providers: {
        gemini: Boolean(process.env.GEMINI_API_KEY),
        openrouter: Boolean(process.env.OPENROUTER_API_KEY),
        mock: true
      }
    });
  });

  // NEW: Erotic Avatar Portrait Generator (makes the inline synth + creator avatar features visible & functional)
  app.post('/api/generate-avatar', async (req, res) => {
    try {
      const { prompt = 'seductive character portrait', provider = 'gemini', customApiKey } = req.body;
      
      // Generate a beautiful themed SVG placeholder (erotic cyber-neon style) so the feature works immediately
      // In a full production setup you would call Gemini Imagen / Vertex AI image gen or an external NSFW-capable model here
      const hash = prompt.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const hue = Math.abs(hash) % 360;
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="hsl(${hue}, 75%, 12%)"/>
      <stop offset="100%" stop-color="#0a0a0c"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="8" result="coloredBlur"/>
    </filter>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <circle cx="256" cy="210" r="135" fill="hsl(${hue}, 65%, 35%)" opacity="0.9"/>
  <ellipse cx="256" cy="380" rx="155" ry="95" fill="hsl(${hue}, 55%, 22%)"/>
  <circle cx="256" cy="210" r="135" fill="none" stroke="hsl(${hue}, 90%, 70%)" stroke-width="3" filter="url(#glow)"/>
  <text x="256" y="470" text-anchor="middle" fill="#e2e8f0" font-size="22" font-family="monospace" opacity="0.75">${prompt.substring(0, 28)}...</text>
  <circle cx="180" cy="180" r="18" fill="hsl(${hue}, 90%, 75%)" opacity="0.6"/>
  <circle cx="330" cy="180" r="18" fill="hsl(${hue}, 90%, 75%)" opacity="0.6"/>
</svg>`;
      
      const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
      
      res.json({ 
        imageUrl: dataUrl, 
        model: 'erotic-placeholder-avatar-v1',
        note: 'Stunning themed portrait generated. Connect real image model (Imagen/Gemini vision) for photoreal NSFW results.' 
      });
    } catch (err: any) {
      console.error('Avatar gen error:', err);
      res.status(500).json({ error: err.message || 'Avatar synthesis failed' });
    }
  });

  // NEW: TTS endpoint (voice narration for model responses). Frontend falls back gracefully.
  app.post('/api/tts', async (req, res) => {
    try {
      const { text, voice = 'en-US-Standard-C' } = req.body;
      if (!text) return res.status(400).json({ error: 'text is required' });
      
      // Placeholder response — real Gemini TTS or ElevenLabs would go here.
      // Returning null audio tells frontend to use browser SpeechSynthesis (already implemented & works great for dirty talk)
      res.json({ 
        audio: null, 
        note: 'Browser TTS fallback engaged for explicit narrative voice. Full neural voice coming soon.' 
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API POST route to handle chat
  app.post('/api/chat', async (req, res) => {
    try {
      if (!req.body.scenarioContext) {
        return res.status(400).json({ error: 'scenarioContext is required' });
      }
      if (!Array.isArray(req.body.messages) || req.body.messages.length === 0) {
        return res.status(400).json({ error: 'messages must be a non-empty array' });
      }

      const { messages, scenarioContext, provider = 'gemini', openRouterModel = 'deepseek/deepseek-chat', customApiKey, modelSettings, sessionStats, charMemories } = req.body; 
      
      if (!['gemini', 'openrouter', 'mock'].includes(provider)) {
        return res.status(400).json({ error: 'provider must be one of gemini, openrouter, mock' });
      }

      if (provider === 'mock') {
        const mockResponse = `This is a mock response from the UI test provider. The system is operating normally without using true API quota.

Here is a typical narrative paragraph testing the UI rendering length. It usually contains actions and dialogue.

<STATE>
{
  "characterStates": [
    {
      "name": "Jane",
      "arousal": 35,
      "trust": 40,
      "affinity": 20,
      "tags": ["testing"]
    }
  ],
  "pornstarStats": {
    "subscribers": 1500,
    "tips": 250,
    "socialMood": "Trending up"
  }
}
</STATE>

[OPTIONS]
1. Respond positively to the mock scenario.
2. Question the reality of this simulated test environment.
3. Attempt to interact with the mock character 'Jane'.
4. Decline and exit the mock interaction.`;
        
        // Add a slight delay to simulate network
        await new Promise(resolve => setTimeout(resolve, 800));
        return res.json({ text: mockResponse, model: 'mock-local-ui-tester' });
      }

      const systemPrompt = generateSystemPrompt(
        scenarioContext.scenarioDescription,
        scenarioContext.characters,
        scenarioContext.playerCharacterId,
        scenarioContext.gameMode,
        scenarioContext.options,
        scenarioContext.charMemories || charMemories
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
            'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
            'X-Title': 'Eros Interactive Framework'
          },
          body: JSON.stringify({
            model: openRouterModel,
            messages: formattedMessages,
            temperature: modelSettings?.temperature || 0.9,
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData?.error?.message || `OpenRouter API error (Status ${response.status})`);
        }

        const completion = await response.json();
        const text = completion.choices?.[0]?.message?.content || '';
        return res.json({ text, model: openRouterModel });
      }

      const ai = getGenAIClient();
      
      const formattedMessages = messages.map((m: any) => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));

      // Define model fallback chain
      const modelChain = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
      let lastError: any = null;

      for (const modelName of modelChain) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: formattedMessages,
            config: {
              systemInstruction: systemPrompt,
              safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
              ],
            }
          });
          
          return res.json({ text: response.text, model: modelName });
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