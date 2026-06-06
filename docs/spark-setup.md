# Gemini Spark + Brittany TV Agent Database

Spark owns recommendation logic. This app reads the sheet and displays results.

## Sheet tabs

| Tab | Purpose |
|---|---|
| `user_ratings` | Shows you've watched, ratings, DNF |
| `recommendations` | Spark picks with fit scores and rationale |
| `daily_digest` | Daily summary JSON |
| `episode_alerts` | New episodes for shows you've watched |

## Spark workflow

1. Spark reads `user_ratings` to learn your taste.
2. Spark writes new rows to `recommendations`, `daily_digest`, and `episode_alerts`.
3. The app displays unread episode alerts at the top of **Up Next**, then Spark recommendations.
4. You can dismiss alerts (`seen=TRUE`) or mark recs (`user_action`) from the app.

## Keeping the sheet private

- Use **OAuth as your Google account** (not a service account share).
- Spark connects to Sheets as you via its Google Sheets connector.
- The app uses the same OAuth refresh token pattern as brittany-portal.

## Refresh schedule

Configure Spark to refresh recommendations on your preferred schedule (e.g. daily). The app always reads the latest sheet data on load (with a short server cache).
