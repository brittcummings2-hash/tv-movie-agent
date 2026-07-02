# Gemini Spark + Brittany TV Agent Database

Spark owns recommendation logic. This app reads the sheet and displays results.

## Sheet tabs

| Tab | Purpose |
|---|---|
| `user_ratings` | Your library — want to watch, in progress, watched, DNF |
| `recommendations` | Spark picks with fit scores and rationale |
| `daily_digest` | Optional daily summary JSON (Spark can still write; app no longer displays it) |
| `episode_alerts` | New episodes for shows you're watching |

## App flow (top to bottom)

1. **Quick add** — plain English ("Want to watch Severance", "Finished Shogun, 5 stars")
2. **New Episodes** — unread alerts from Spark (dismiss marks `seen=TRUE`)
3. **For You** — Spark recommendations; **Want to Watch** adds to `user_ratings` and marks rec `user_action=accept`
4. **Want to Watch** — `watch_status=want_to_watch`
5. **In Progress** — `watch_status=watching`
6. **Watched** — `watch_status=watched`
7. **Did Not Finish** — `watch_status=dnf` (only shown if you have any)

## Spark workflow

1. Spark reads `user_ratings` to learn your taste.
2. Spark writes new rows to `recommendations` and `episode_alerts`.
3. When you tap **Want to Watch** on a rec, the app adds it to `user_ratings` — Spark should treat that as signal on the next refresh.
4. Spark can skip `daily_digest` if you prefer; recommendations tab is enough.

## Manual add trigger (app → Spark)

When you **Add a show** in the app, it now:

1. Writes `user_ratings` (as before)
2. Appends a **pending** row to `spark_queue`
3. Sets `settings!B2` (`run_agent_trigger`) to `TRUE` and `settings!B3` to the title

Your **Workspace Spark agent** must process pending `spark_queue` rows and write full `recommendations` profiles (see `docs/spark-prompt.md` section 6). Add a conditional schedule that runs when `settings!B2` is `TRUE` for near-instant results.

The app polls for up to 3 minutes after add and refreshes the card when Spark’s rec row lands.

**Note:** The in-app “Run Spark agent” button requires `GEMINI_API_KEY` on Vercel (not set today). The sheet trigger uses your real Workspace Spark instead.

## Watch status values

Use these in `user_ratings.watch_status`:

- `want_to_watch`
- `watching`
- `watched`
- `dnf`

## Keeping the sheet private

- Use **OAuth as your Google account** (not a service account share).
- Spark connects to Sheets as you via its Google Sheets connector.
- The app uses the same OAuth refresh token pattern as brittany-portal.

## Refresh schedule

Configure Spark to refresh recommendations on your preferred schedule (e.g. daily). The app always reads the latest sheet data on load (with a short server cache).
