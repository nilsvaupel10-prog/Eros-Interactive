import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { generateSystemPrompt } from './server/prompt';
import dotenv from 'dotenv';
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json({ limit: '2mb' }));

  function getGenAIClient(customKey?: string): GoogleGenAI {
    const key = customKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is missing. Please configure it in your secrets setting, or supply your custom key.');
    }
    return new GoogleGenAI({ 
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
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

  // API POST route to handle chat
  app.post('/api/chat', async (req, res) => {
    try {
      if (!req.body.scenarioContext) {
        return res.status(400).json({ error: 'scenarioContext is required' });
      }
      if (!Array.isArray(req.body.messages) || req.body.messages.length === 0) {
        return res.status(400).json({ error: 'messages must be a non-empty array' });
      }

      const { messages, scenarioContext, provider = 'gemini', openRouterModel = 'deepseek/deepseek-chat', customApiKey, sessionStats, modelSettings } = req.body; 
      
      if (!['gemini', 'openrouter', 'mock'].includes(provider)) {
        return res.status(400).json({ error: 'provider must be one of gemini, openrouter, mock' });
      }

      if (provider === 'mock') {
        const mockResponse = `The simulation reacts to your stance. [STANCE: ${sessionStats?.stance || 'normal'}]
Stamina: ${sessionStats?.stamina || 100}%. Willpower: ${sessionStats?.willpower || 100}%.

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
  ]
}
</STATE>

[OPTIONS]
1. Respond positively to the mock scenario.
2. Question the reality of this simulated test environment.
3. Attempt to interact with the mock character 'Jane'.
4. Decline and exit the mock interaction.`;
        
        await new Promise(resolve => setTimeout(resolve, 800));
        return res.json({ text: mockResponse, model: 'mock-local-ui-tester' });
      }

      const systemPrompt = generateSystemPrompt(
        scenarioContext.scenarioDescription,
        scenarioContext.characters,
        scenarioContext.playerCharacterId,
        scenarioContext.gameMode,
        sessionStats,
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
            'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
            'X-Title': 'Eros Interactive Framework'
          },
          body: JSON.stringify({
            model: openRouterModel,
            messages: formattedMessages,
            temperature: modelSettings?.temperature ?? 0.9,
            top_p: modelSettings?.topP ?? 1.0,
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData?.error?.message || `OpenRouter API error (Status ${response.status})`);
        }

        const textResponse = await response.text();
        if (!textResponse || textResponse.trim() === '') {
          throw new Error(`OpenRouter API returned an empty response (Status ${response.status})`);
        }
        
        const completion = JSON.parse(textResponse);
        const text = completion.choices?.[0]?.message?.content || '';
        return res.json({ text, model: openRouterModel });
      }

      const ai = getGenAIClient(customApiKey);
      
      const formattedMessages = messages.map((m: any) => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));

      // Define modern, authorized models fallback chain
      const modelChain = ['gemini-3.5-flash', 'gemini-3.1-flash-lite'];
      let lastError: any = null;

      for (const modelName of modelChain) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: formattedMessages,
            config: {
              systemInstruction: systemPrompt,
              temperature: modelSettings?.temperature ?? 0.9,
              topP: modelSettings?.topP ?? 1.0,
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
      const isQuota = err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED') || err.message?.includes('quota');
      res.status(isQuota ? 429 : 500).json({ 
        error: isQuota 
          ? 'Gemini Quota Exceeded. The free-tier limit has been reached for this model. Use OpenRouter fallback or provide your own API key in Settings.' 
          : (err.message || 'An error occurred during generation.') 
      });
    }
  });

  // API route to handle high-fidelity Gemini Text-to-Speech (TTS)
  app.post('/api/tts', async (req, res) => {
    try {
      const { text, voice = 'Kore', customApiKey, provider = 'gemini' } = req.body;
      if (!text) {
        return res.status(400).json({ error: 'text is required' });
      }

      if (provider === 'mock') {
        await new Promise(resolve => setTimeout(resolve, 200));
        return res.json({ audio: '' });
      }

      const ai = getGenAIClient(customApiKey);
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice }, // 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        return res.json({ audio: base64Audio });
      } else {
        throw new Error('No audio content returned from Gemini');
      }
    } catch (err: any) {
      console.error('TTS error:', err);
      res.status(500).json({ error: err.message || 'Error occurred during speech synthesis' });
    }
  });

  // API route to handle AI Avatar synthesis
  app.post('/api/generate-avatar', async (req, res) => {
    try {
      const { prompt, customApiKey, provider = 'gemini' } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: 'prompt is required' });
      }

      if (provider === 'mock') {
        await new Promise(resolve => setTimeout(resolve, 1500));
        // Return a stable colorful abstract seed image for mock mode
        const hash = prompt.split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
        const hue = (hash * 137.508) % 360;
        return res.json({ imageUrl: `https://placehold.co/400x400/hsl(${hue},45%,15%)/hsl(${hue},100%,75%)?text=Eros+Vector+Cast` });
      }

      const ai = getGenAIClient(customApiKey);
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: `A high-fidelity, high-fantasy or modern cinematic adult gaming portrait avatar of: ${prompt}. Character focus, clear facial features, aesthetic lighting, high contrast.` }]
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1"
          }
        }
      });

      let base64Image = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData?.data) {
          base64Image = part.inlineData.data;
          break;
        }
      }

      if (base64Image) {
        return res.json({ imageUrl: `data:image/png;base64,${base64Image}` });
      } else {
        // Fallback info text
        throw new Error('Model did not return binary image data. Ensure your API key has access to image generation.');
      }
    } catch (err: any) {
      console.error('Avatar generation error:', err);
      
      // Better reporting for quota issues
      const errText = err.message || '';
      if (errText.includes('429') || errText.includes('RESOURCE_EXHAUSTED') || errText.includes('quota')) {
        return res.status(429).json({ 
          error: 'Gemini Image Quota Exceeded. The free-tier limit has been reached. Please try again later or provide your own API key in Settings to continue synthing avatars immediately.' 
        });
      }

      res.status(500).json({ error: err.message || 'Error occurred during avatar generation' });
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
