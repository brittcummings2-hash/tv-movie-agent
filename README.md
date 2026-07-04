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
- `TMDB_API_KEY` — posters, hero images, trailers, streaming platform
- `GEMINI_API_KEY` — optional; parses “I watched X, 5 stars” for quick-add
- `NEXT_PUBLIC_GEMINI_SPARK_URL` — optional; where the header **Spark** button
  opens. Set it to your Gemini Spark gem's URL; defaults to the Gemini app.
- `PORTAL_PASSWORD` — login gate. **Required in production** — the deployed app
  refuses to serve without it (otherwise your library and sheet write access
  would be public).
- `CRON_SECRET` — optional; when set, Vercel sends it with cron requests and
  `/api/backup` requires it (or a logged-in session).

## Health check & backups

- `/api/health` — confirms the Google token refreshes and the sheet is readable.
  A Vercel cron hits it daily; failures show in Vercel → Project → Cron Jobs
  (check there if the app misbehaves).
- `/api/backup` — snapshots `user_ratings`, `recommendations`, and
  `episode_alerts` into hidden `backup_*` tabs in the same spreadsheet.
  A Vercel cron runs it weekly; each run overwrites the previous snapshot.

## Install on your phone

The app is a PWA. On iPhone: open it in Safari → Share → **Add to Home Screen**.
It gets its own icon and opens full-screen like a native app.

## Deploy

Push to GitHub and deploy on Vercel with the same env vars.
