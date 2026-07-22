# Rebuild plan: replacing Gemini Spark

> **Status: implemented.** Phases 1–4 and the code side of Phase 5 are done —
> see the README's "How recommendations work" section for the current state.
> Remaining manual steps: set `ANTHROPIC_API_KEY` in Vercel, turn off the
> Workspace Spark agent's schedules, and (after a verification week) delete
> the `spark_queue` and `settings` tabs from the sheet.

Goal: the app owns all recommendation intelligence itself. No external
Workspace Spark agent, no Gemini API, no sheet-flag trigger dance. The
Google Sheet stays as the datastore, TMDB stays for metadata, and the UI
keeps working with the same `recommendations` / `episode_alerts` schema.

## What Spark does today (the jobs we must replace)

| # | Job | How it works today | Replacement |
|---|-----|--------------------|-------------|
| 1 | Fresh recommendations | External Workspace Spark agent reads `user_ratings`, writes `recommendations` rows on its own schedule | In-app engine: Claude API + web search, run by Vercel cron + on-demand button |
| 2 | Profiling a manually added show | App appends to `spark_queue`, flips `settings!B2`, then polls the sheet for up to 3 min waiting for Spark | Synchronous Claude call inside the add request — result lands immediately, queue/poll machinery deleted |
| 3 | New-episode alerts | Spark writes `episode_alerts` rows | **No LLM needed** — a TMDB cron computes drops for `watching`/`caught_up` shows deterministically |
| 4 | Daily digest | Spark writes `daily_digest` (app no longer displays it) | Dropped entirely |

Secondary Gemini usage in-app (all behind `GEMINI_API_KEY`, which is unset
in production today): instant profiling fallback (`lib/title-profile.ts`),
on-demand rec run (`POST /api/spark` → `lib/spark.ts`), and quick-add
parsing (`lib/gemini.ts` — which already has a full regex/heuristic
fallback that is what actually runs in prod).

## Target architecture

```
Vercel cron ──► /api/recommend/run ──► Claude (web search) ──► recommendations tab
Vercel cron ──► /api/alerts/scan   ──► TMDB (no LLM)       ──► episode_alerts tab
Add a show  ──► /api/watched       ──► Claude (sync)       ──► recommendations tab (profile row)
Quick add   ──► existing heuristics (Claude optional upgrade)
```

The sheet remains the system of record — ratings history, backups, and the
ability to eyeball/fix data by hand are all worth keeping. Nothing in this
plan requires a database migration.

## Phases

### Phase 1 — In-app recommendation engine (the core swap)

New `lib/recommend.ts`, largely a port of `lib/spark-core.ts` +
`lib/spark.ts`:

- Keep `buildTasteSummary()` as-is — the taste-profile builder (top-40
  rated rows, excluded titles, active recs) is model-agnostic and already
  good.
- Replace `callSparkGemini()` with a Claude API call
  (`claude-sonnet-5`) using the **web search tool** so buzz/availability
  claims are grounded in current reality, and a JSON output schema matching
  `RecommendationSheetEntry` exactly. Same taste-voice prompt
  (`SPARK_TASTE_VOICE`), same field spec, same post-filters
  (`normalizeSparkDraft`, excluded-title dedupe).
- New route `POST /api/recommend/run` (replaces `POST /api/spark`), plus a
  Vercel cron entry (e.g. 3×/week) in `vercel.json`, protected by
  `CRON_SECRET` like `/api/backup`.
- The header **Spark** button becomes **Fresh picks**: instead of linking
  out to Gemini, it calls `/api/recommend/run` and refreshes the For You
  rail when new rows land.

Because the engine writes the same columns to the same tab, zero UI
component changes are needed for rendering.

Env: add `ANTHROPIC_API_KEY` to Vercel. Note `maxDuration` — a web-search
run can take 30–60s; keep `maxDuration = 60` (Hobby ceiling) and cap at
2–3 searches per run, or use `waitUntil` + the existing poll-style refresh
if runs ever exceed it.

### Phase 2 — Instant title profiling (kill the queue)

- In `/api/watched` (add-show path) and `/api/spark/profile`, replace the
  `ensureSparkProfileForTitle` → `triggerSparkProfileRequest` fallback
  chain with one synchronous Claude profiling call
  (port of `lib/title-profile.ts`). TMDB hints (platform, release date,
  type) are already resolved at add time and get merged via
  `mergeDraftWithHints`, so the model only writes the taste prose.
- Delete: `lib/spark-trigger.ts`, `app/api/spark/poll/route.ts`,
  `scripts/ensure-spark-tabs.mjs`, the `pollForSparkProfile` /
  3-minute-poll logic in `AppShell.tsx`, and the `spark_queue` + `settings`
  tabs (after cutover).
- Toast copy changes from "Spark is profiling it — fills in after the next
  agent run" to an immediate result.

### Phase 3 — Deterministic episode alerts (no LLM)

- Add a `tmdb_id` column to `user_ratings`, backfilled via the existing
  `resolveTmdbTitle()` on first scan, so matching is exact thereafter.
- New `POST /api/alerts/scan` + daily Vercel cron: for every
  `watching`/`caught_up` show, pull TMDB `last_episode_to_air` /
  `next_episode_to_air`, and append an `episode_alerts` row when a new
  episode (or season) has dropped since the last scan. Alert text is
  templated ("Episode 4 ('Pierced') dropped Friday on Apple TV+") — same
  format Spark produced, existing alerts UI unchanged.
- This is strictly more reliable than Spark: air dates are data, not
  something to ask a model about.

### Phase 4 — Quick-add parsing

- The heuristic parser in `lib/gemini.ts` already handles prod (no key
  set). Rename the module (`lib/parse-entry.ts`), drop the Gemini branch,
  and optionally add a Claude Haiku fallback for phrasings the regexes
  miss. Low priority — current behavior is unchanged either way.

### Phase 5 — Cleanup and cutover

1. Pause/delete the Workspace Spark agent's schedules (manual, in Gemini).
2. Verify one full week: cron recs landing, add-show profiling instant,
   alerts firing for a weekly show (Cape Fear is a good canary).
3. Delete `lib/spark.ts`, `lib/spark-core.ts` (whatever wasn't ported),
   `docs/spark-setup.md`, `docs/spark-prompt.md`; remove `GEMINI_API_KEY`
   and `NEXT_PUBLIC_GEMINI_SPARK_URL` from Vercel and
   `.env.local.example`; purge "Spark" naming from UI copy
   (`Nav`, `AppShell`, `AddShowModal`, `RecommendedView`, toasts).
4. Delete the `spark_queue` and `settings` tabs from the sheet; keep
   `daily_digest` history or archive it into `backup_*`.
5. Update `README.md` env-var table and the backup route's tab list if the
   digest tab goes away.

## Order and effort

| Phase | Size | Risk | Notes |
|-------|------|------|-------|
| 1 Recommendation engine | ~1 day | Medium | Prompt tuning is the only real unknown |
| 2 Instant profiling | ~half day | Low | Mostly deletion |
| 3 TMDB alerts | ~1 day | Low | New column + cron; pure data work |
| 4 Quick-add | ~1 hour | None | Rename + optional upgrade |
| 5 Cleanup | ~half day | Low | Do last, after a verification week |

Phases 1–3 are independent and can ship separately; each one retires a
Spark job on its own. Costs stay trivial: a few recommendation runs a week
on Sonnet with 2–3 web searches is cents per run; TMDB and the alerts cron
are free.

## What deliberately stays the same

- Google Sheet schema for `user_ratings`, `recommendations`,
  `episode_alerts` — so history, backups, and every UI component carry
  over untouched.
- TMDB enrichment (posters, hero art, trailers, streaming platform).
- Auth, PWA install flow, health check, weekly backup crons.
