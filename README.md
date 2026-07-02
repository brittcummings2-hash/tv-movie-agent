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
  - The OAuth consent screen for this client must be **published to production**
    (Google Cloud Console → APIs & Services → OAuth consent screen). While it is
    in "Testing" status, Google expires the refresh token every 7 days and the
    app breaks with `invalid_grant` until you re-run `npm run google:auth`.
- `TMDB_API_KEY` — posters and hero images
- `GEMINI_API_KEY` — optional; parses “I watched X, 5 stars” for quick-add
- `PORTAL_PASSWORD` — optional login gate for deploy

## Deploy

Push to GitHub and deploy on Vercel with the same env vars.
