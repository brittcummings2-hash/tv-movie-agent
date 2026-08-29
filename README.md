# TV Movie Agent

Personal app to track what you've watched, with a built-in recommendation
engine (Claude API + web search) — no external agent required.

## Setup

```bash
npm install
cp .env.local.example .env.local
# Fill in Google OAuth + TMDB_API_KEY + ANTHROPIC_API_KEY
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
- `TMDB_API_KEY` — posters, hero images, trailers, streaming platform, and the
  new-episode alert scan
- `ANTHROPIC_API_KEY` — powers the recommendation engine, show profiling on
  add, and smarter quick-add parsing. Without it the tracker still works;
  recommendations and profiles just won't generate.
- `ANTHROPIC_MODEL` — optional; defaults to `claude-opus-4-8`
- `PORTAL_PASSWORD` — optional login gate. Set it to require sign-in; remove
  it to serve the app openly. Without it, anyone with the URL can view the
  library, write to the sheet through the app, and trigger the
  recommendation engine (which spends Anthropic credits).
- `CRON_SECRET` — optional; when set, Vercel sends it with cron requests and
  the cron-hit endpoints require it (or a logged-in session).

## How recommendations work

Everything runs inside the app now (the old Gemini Spark workflow is retired):

- **Fresh picks** — `/api/recommend/run` builds a taste profile from
  `user_ratings` (5-star faves weighted heavily, DNFs as hard-avoids), pulls a
  candidate pool of recent releases from TMDB (release dates, US platforms,
  and streamability pre-verified — no web search in the loop), and asks Claude
  to pick the 3 best taste fits, appending them to the `recommendations` tab.
  Runs on a daily cron and on demand via the header **Fresh picks** button.
  New stuff only: candidates must be first released within the last 3 months
  (or be a dated upcoming premiere), and any title that has ever appeared as
  a rec — acted on or not — is permanently excluded from future runs, so
  nothing repeats. If no new release clears the bar that day, the run adds
  nothing rather than falling back to older catalog titles.
- **Profiling on add** — adding a show profiles it synchronously (fit score,
  hook, comps) and writes an accepted `recommendations` row. No queue, no
  polling.
- **New-episode alerts** — `/api/alerts/scan` (daily cron) checks TMDB air
  dates for every show you're watching and appends `episode_alerts` rows
  deterministically. No LLM involved.

The `spark_queue` and `settings` tabs in the sheet are no longer used and can
be deleted once the old Workspace Spark agent is turned off.

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
