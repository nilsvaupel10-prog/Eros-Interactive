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
        scenarioContext.gameMode
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

      const modelName = 'gemini-2.5-flash';
      
      const requestOptions = {
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
        }
      };

      const response = await ai.models.generateContent(requestOptions);
      
      res.json({ text: response.text });
    } catch (err: any) {
      console.error('Chat error:', err);
      res.status(500).json({ error: err.message || 'An error occurred during generation.' });
    }
  });

  // API POST route to handle avatar image generation
  app.post('/api/generate-avatar', async (req, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Prompt description is required and must be a string.' });
      }

      const ai = getGenAIClient();
      
      // We steer the prompt specifically into high-quality stylized cyberpunk anime character avatar photos
      const refinedPrompt = `${prompt}, high-quality stylized avatar profile vector portrait, focus on close-up face, gorgeous erotica gaming console artwork, isolated clean dark background, dramatic neon glowing accents, polished digital illustration.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: [{ text: refinedPrompt }],
        config: {
          imageConfig: {
            aspectRatio: "1:1"
          },
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          ],
        }
      });

      let imageUrl: string | null = null;
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            imageUrl = `data:image/png;base64,${part.inlineData.data}`;
            break;
          }
        }
      }

      if (!imageUrl) {
        throw new Error('Image generation succeeded but no inline image data was returned by the Gemini generator.');
      }

      return res.json({ imageUrl });
    } catch (err: any) {
      console.error('Avatar generation error:', err);
      return res.status(500).json({ 
        error: err.message || 'Dynamic avatar generation failed, please make sure your paid Gemini API key is configured with the correct access rights.' 
      });
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
