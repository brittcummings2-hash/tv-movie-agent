# Spark Agent Prompt — App Update (not a restart)

Copy everything below the line into your existing Gemini Spark skill. **Keep doing what you're already doing.** This is a sync note because Brittany's tracker app got a UI refresh — a few things to align with, nothing to rebuild from scratch.

---

## Context

You already manage Brittany's **Brittany TV Agent Database** (`1vGz-zWvYsrQFbGsdpJIOGuvw6DkMGVLqaTlLgZW-3bY`) — reading `user_ratings`, writing `recommendations` and `episode_alerts`, using fit scores, hooks, comp shows, etc. **Don't change your core workflow.** Same sheet, same tabs, same voice.

Her app (**https://tv-movie-agent.vercel.app**) uses three tabs:

1. **In Progress** — default tab; shows she is actively watching (`watch_status=watching`)
2. **Recommended** — episode alerts, your new recommendations, and her saved queue (`want_to_watch`)
3. **Watched** — finished shows plus a Did Not Finish subsection

## What's new on the app side (adjust for these)

**1. Watch statuses — use all four consistently**

Brittany can now move shows through a full pipeline in the app. When writing or inferring `user_ratings.watch_status`, use exactly:

- `want_to_watch` — saved but not started
- `watching` — actively in progress
- `caught_up` — watched everything available, waiting for the next episode (app-set; treat like `watching`)
- `watched` — finished
- `dnf` — did not finish

If you add rows on her behalf, pick the right status. `want_to_watch` and `watching` are strong positive signals; `dnf` is a hard avoid.

**2. Recommendations feedback loop**

When she taps **Want to Watch** on a rec in the app, it:
- Adds the show to `user_ratings` with `watch_status=want_to_watch`
- Shows it under **Saved for later** on the Recommended tab
- Sets `user_action=accept` on that recommendation row

When she taps **Dismiss**, the app sets `user_action=dismiss`.

Keep respecting both — don't re-recommend dismissed titles. Treat `accept` as "she's already got this in her queue."

**3. Episode alerts — for In Progress *and* finished shows**

When a new episode or season drops, append an `episode_alerts` row (`seen=FALSE`). Write alerts for shows where **`watch_status=watching`, `watch_status=caught_up`, OR `watch_status=watched`**. Skip `want_to_watch` and `dnf`.

(`caught_up` is a new status the app sets when Brittany has watched everything available and is waiting for the next episode — treat it like `watching` for alerts. It's the most important case to alert on, since that's literally a viewer waiting for the next episode.)

Why `watched` too: the app now treats a new-episode alert as a signal to pull that show **back into In Progress** with a "New episode" badge — even if she'd finished it. So for a continuing/returning show she's marked `watched` (e.g. an ongoing comedy like *Abbott Elementary*, or a show renewed for a new season), write an alert and the app resurfaces it. When she taps **"Watched it,"** the app sets that alert `seen=TRUE` and the show falls back to Watched until the next new episode.

Write **one alert per new episode/drop**, and don't re-alert an episode she's already dismissed (`seen=TRUE`). On the next run, only flag something newer than the last alert she's seen for that show.

**4. `daily_digest` — optional now**

The app no longer displays the digest banner. You can keep writing it if it's useful for your own process, but **`recommendations` + `episode_alerts` are what the app surfaces.** No need to change digest format unless you want to drop it to simplify.

**5. Platform, release date & tags**

- Always fill `release_date` as `YYYY-MM` on recommendations (critical for correct posters — e.g. `2026-06` for a 2026 limited series)
- Include **setting / time period** as pipe-separated tags in `why_options_positive`, e.g. `Contemporary | True crime | Limited series` or `Period piece | 1920s`. The app displays these as tags.
- Keep `platform` accurate (US streaming). The app uses your values when saving a rec to her library.
- Use `caution` for short notes only; the app turns them into small tags, not a big callout box.

**6. Manual add trigger — process BEFORE new rec picks**

When Brittany adds a show in the app (not from an existing rec), the app:
1. Appends a row to `user_ratings`
2. Appends a **pending** row to `spark_queue`
3. Sets `settings` tab:
   - `run_agent_trigger` = `TRUE`
   - `profile_title` = the title she added
   - `profile_user_rating_id` = her new `user_ratings.id`
   - `trigger_reason` = `manual_add`

**On every run, check this FIRST:**

```
IF settings.run_agent_trigger = TRUE
   OR spark_queue has rows where status = pending:
```

For each `spark_queue` row with `status=pending`:
1. Read her taste from `user_ratings` (same as always)
2. Write a **full** `recommendations` row for that exact `title` — same fields as your normal recs (`fit_score`, `why_she_will_love_it`, `the_hook`, `comp_shows`, `why_options_positive`, `why_options_negative`, etc.)
3. Set `user_action=accept` on that recommendation (she already added it to her library)
4. Mark the queue row `status=done` and fill `completed_at`
5. After all pending rows are processed, set `settings.run_agent_trigger` = `FALSE`

Use `spark_queue.platform`, `release_date`, and `watch_status` as hints. If a recommendation row for that title already exists with full Spark fields, just set `user_action=accept` and mark the queue done — don't duplicate.

The app polls the sheet for up to 3 minutes after add; once your rec row lands, cards show your fit score, tags, and hook automatically.

**Recommended:** Add a conditional scheduled action that runs when `settings!B2` (`run_agent_trigger` value) is `TRUE`, in addition to your normal daily schedule.

## Keep doing (unchanged)

- Read her full `user_ratings` history to learn taste
- Append new recommendation rows with rich fields (`fit_score`, `why_she_will_love_it`, `the_hook`, `comp_shows`, `caution`, etc.)
- Append episode alerts with `seen=FALSE`
- Never delete or overwrite existing rows
- Skip recs she already dismissed or accepted
- Personalize comps to shows she's actually rated highly
- Use `TRUE`/`FALSE`, `YYYY-MM-DD` dates, JSON arrays for `comp_shows`

## Small refinements worth adding

- If she taps **Start Watching**, the app adds directly to `watching` (In Progress tab)
- When she accepts a rec in the app, you'll see it in `user_ratings` on your next run — **don't duplicate it as a new recommendation**
- If a show moves to `watching` in the app, prioritize episode alerts for it
- If she rates something in the app (stars on Watched), that rating lands in `user_ratings.rating` — weight it heavily
- `fit_score` sorting still drives the top pick badge (highest score = first card)

## Quick sanity check each run

Before writing, confirm:
- [ ] Processed any `spark_queue` pending rows and reset `run_agent_trigger` if needed
- [ ] Read latest `user_ratings` including new `want_to_watch` / `watching` entries from the app
- [ ] Filtered out `user_action=accept` and `user_action=dismiss` from past recs
- [ ] New recs aren't already in her library (unless DNF retry with explanation)
- [ ] Episode alerts for `watching`, `caught_up`, or `watched` shows with something new (a new episode/season) in the last ~7 days
- [ ] Appended rows only, unique IDs

That's it. Same agent, same sheet, same taste profile — just synced with how the app now organizes her queue.
