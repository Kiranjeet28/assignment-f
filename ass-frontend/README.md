# Text-Only AI Question Generator

Upload textbook pages; the backend extracts body text only (skipping photos, maps, diagrams, captions) and generates questions.

## Setup
```sh
npm install
npm run dev
```

## Environment
Create `.env`:
```
VITE_API_URL=https://your-backend.example.com
```
The UI calls `POST {VITE_API_URL}/api/generate` (see `src/lib/api.ts`). Use **Load sample JSON** (`src/data/sample.json`) to demo without a backend.

## Deploy to Vercel
1. Push the repo to GitHub and import it at vercel.com/new.
2. Framework preset: Vite (build `npm run build`).
3. Add `VITE_API_URL` under Project → Settings → Environment Variables.
4. Deploy. Make sure your backend allows CORS from the Vercel domain.
