# Text-Only AI Question Generator

Upload textbook pages; the backend uses OCR and heuristic layout detection to extract body text, flag likely photos/maps/diagrams/captions, and generate questions. Review skipped-region overlays because low-resolution or unusual layouts can still be missed or misclassified.

Live frontend: [assignment-f-five.vercel.app](https://assignment-f-five.vercel.app/)

## Setup
```sh
npm install
npm run dev
```

## Environment
Create `.env` using `.env.example` as a starting point:
```
VITE_API_BASE_URL=https://YOUR-BACKEND-URL
```
The UI uploads files to `POST {VITE_API_BASE_URL}/api/upload` and sends the returned pages to `POST {VITE_API_BASE_URL}/api/generate` (see `src/lib/api.ts`). Set the backend's `CORS_ORIGINS` to include the deployed frontend origin. Keep the Gemini API key in the backend environment only. Use **Load sample JSON** (`src/data/sample.json`) to demo without a backend.

## Deploy to Vercel
1. Push the repo to GitHub and import it at vercel.com/new.
2. Framework preset: Vite (build `npm run build`).
3. Add `VITE_API_BASE_URL` under Project → Settings → Environment Variables.
4. Deploy. Make sure your backend allows CORS from the Vercel domain.
