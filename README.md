<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Eros Interactive

This repository contains a Vite + React frontend with an Express API server for Gemini/OpenRouter-backed interactive story generation.

## Run locally

**Prerequisites:** Node.js 20+

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the example environment file and fill in your secrets:
   ```bash
   cp .env.example .env.local
   ```

3. Set at least one API key:
   - `GEMINI_API_KEY` for Gemini generation.
   - `OPENROUTER_API_KEY` for OpenRouter models, unless you provide a temporary key in the app settings.

4. Run the app:
   ```bash
   npm run dev
   ```

5. Open the local server shown in your terminal, usually:
   ```text
   http://localhost:3000
   ```

## Useful scripts

```bash
npm run lint
npm run build
npm start
```

`npm run build` creates both the Vite frontend bundle and the production Express server bundle in `dist/`.
