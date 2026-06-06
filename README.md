# TV Movie Agent

Personal app to track what you've watched and see Gemini Spark recommendations.

## Setup

```bash
npm install
cp .env.local.example .env.local
# Fill in Google OAuth + TMDB_API_KEY
npm run google:verify
npm run dev
```

## Env vars

- `GOOGLE_SHEET_ID` — Brittany TV Agent Database
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
- `TMDB_API_KEY` — posters and hero images
- `PORTAL_PASSWORD` — optional login gate for deploy

## Deploy

Push to GitHub and deploy on Vercel with the same env vars.
