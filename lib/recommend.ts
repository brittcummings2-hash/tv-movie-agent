import { filterActiveRecommendations, findRecommendationForTitle, normalizeTitle } from "./search";
import {
  discoverRecentCandidates,
  inferMediaKind,
  resolveTmdbTitle,
  type DiscoverCandidate,
} from "./tmdb";
import { askClaudeJson, isClaudeConfigured } from "./claude";
import { mapRecommendations, mapUserRatings } from "./mappers";
import {
  appendRecommendations,
  getSheetRows,
  updateSheetField,
  type RecommendationSheetEntry,
} from "./sheets";
import type { Recommendation } from "./types";
import { SHEET_TABS } from "./types";

export interface RecommendationDraft {
  title: string;
  release_date: string;
  platform: string;
  type: string;
  fit_score: number;
  available_now: boolean;
  why_she_will_love_it: string;
  the_hook: string;
  comp_shows: string[];
  caution: string;
  buzz_source: string;
  why_options_positive: string;
  why_options_negative: string;
}

export const TASTE_VOICE =
  "She loves female-led mysteries, morally gray leads, layered mysteries, unpredictable twists, " +
  "obsessive characters, elite worlds, smart writing, satisfying endings, and quality true crime. " +
  "Lean hard into tense, twisty psychological THRILLERS — His & Hers energy: sharp, propulsive, a mystery with teeth. " +
  "Not soft, cozy ensemble dramas (The Five Star Weekend energy) — friendship-getaway or beach-read vibes are a miss. " +
  "Nuance: wealthy/coastal settings are fine when the tone is dark — she loved Sirens and The White Lotus; it's softness she avoids, not luxury. " +
  "Avoid: too slow, overhyped docuseries, romance-heavy plots, procedural slog, bleak with no payoff, male-led unless exceptional, sci-fi. " +
  "Current no-go: cartel / narco / drug-trade crime — she's over it for now. " +
  "Weight 5-star ratings and why_reasons tags heavily; treat dnf as hard avoid patterns.";

export const FIELD_SPEC =
  "title, release_date (YYYY-MM), platform, type, fit_score (1-10), available_now (boolean), " +
  "why_she_will_love_it, the_hook, comp_shows (array of 2-3 titles from her library), caution, buzz_source, " +
  "why_options_positive (pipe-separated tags like Contemporary | True crime | Limited series), " +
  "why_options_negative (pipe-separated short cautions).";

export async function buildTasteSummary(): Promise<{
  libraryJson: string;
  excludedTitles: string[];
  activeRecTitles: string[];
  dismissedFeedbackJson: string;
}> {
  const [ratingsRows, recRows] = await Promise.all([
    getSheetRows(SHEET_TABS.USER_RATINGS),
    getSheetRows(SHEET_TABS.RECOMMENDATIONS),
  ]);

  const library = mapUserRatings(ratingsRows);
  const recommendations = mapRecommendations(recRows);
  const activeRecommendations = filterActiveRecommendations(recommendations, library);

  const tasteRows = library
    .filter((item) => item.rating > 0 || item.watch_status.toLowerCase() === "dnf")
    .sort((a, b) => b.rating - a.rating || b.updated_at.localeCompare(a.updated_at))
    .slice(0, 40)
    .map((item) => ({
      title: item.show_title,
      rating: item.rating,
      status: item.watch_status,
      tags: item.why_reasons,
      comments: item.comments,
      platform: item.platform,
      ...(item.watched_with ? { watched_with: item.watched_with } : {}),
    }));

  // Every title that has EVER been recommended is off the table — a repeat
  // is never "new", whether or not she acted on the old card. Only her
  // library plus accepted/dismissed recs used to count, so un-actioned recs
  // kept coming back run after run.
  const excludedTitles = [
    ...new Set(
      [
        ...library.map((item) => item.show_title),
        ...recommendations.map((rec) => rec.title),
      ].filter(Boolean)
    ),
  ];

  // Dismissed recs with feedback are strong avoid-signal — the why matters,
  // not just the title exclusion.
  const dismissedFeedback = recommendations
    .filter((rec) => rec.user_action.trim().toLowerCase() === "dismiss")
    .slice(-20)
    .map((rec) => ({
      title: rec.title,
      rating: rec.user_rating || undefined,
      reasons: rec.user_reasons || undefined,
      comments: rec.user_comments || undefined,
    }));

  return {
    libraryJson: JSON.stringify(tasteRows, null, 2),
    excludedTitles,
    activeRecTitles: activeRecommendations.map((rec) => rec.title),
    dismissedFeedbackJson: JSON.stringify(dismissedFeedback, null, 2),
  };
}

export function normalizeRecommendationDraft(
  entry: RecommendationDraft
): RecommendationSheetEntry | null {
  const title = String(entry.title ?? "").trim();
  if (!title) return null;

  const releaseDate = String(entry.release_date ?? "").trim();
  // Keep the exact day when given (upcoming picks carry their premiere
  // date); otherwise normalize to the usual YYYY-MM.
  const normalizedRelease = /^\d{4}-\d{2}-\d{2}/.test(releaseDate)
    ? releaseDate.slice(0, 10)
    : /^\d{4}-\d{2}/.test(releaseDate)
      ? releaseDate.slice(0, 7)
      : releaseDate;

  return {
    title,
    release_date: normalizedRelease,
    platform: String(entry.platform ?? "").trim(),
    type: String(entry.type ?? "").trim(),
    fit_score: Math.max(1, Math.min(10, Math.round(Number(entry.fit_score) || 7))),
    available_now: Boolean(entry.available_now),
    why_she_will_love_it: String(entry.why_she_will_love_it ?? "").trim(),
    the_hook: String(entry.the_hook ?? "").trim(),
    comp_shows: Array.isArray(entry.comp_shows)
      ? entry.comp_shows.map(String).filter(Boolean).slice(0, 4)
      : [],
    caution: String(entry.caution ?? "").trim(),
    buzz_source: String(entry.buzz_source ?? "").trim(),
    why_options_positive: String(entry.why_options_positive ?? "").trim(),
    why_options_negative: String(entry.why_options_negative ?? "").trim(),
  };
}

export function mergeDraftWithHints(
  draft: RecommendationSheetEntry,
  hints: { title: string; platform?: string; release_date?: string; type?: string }
): RecommendationSheetEntry {
  return {
    ...draft,
    title: hints.title,
    platform: draft.platform || hints.platform || "",
    release_date: draft.release_date || hints.release_date || "",
    type: draft.type || hints.type || "",
  };
}

export interface RecommendationRunResult {
  added: number;
  ids: string[];
}

/** Only titles first released in the last N months count as "new". */
const RECENCY_MONTHS = 3;

/** How far out an upcoming pick's premiere date may be. */
const UPCOMING_HORIZON_MONTHS = 2;

export type RecommendationAudience = "me" | "both";

/** Generate fresh recommendation rows — replaces the external Spark agent's refresh. */
export async function runRecommendationRefresh(
  audience: RecommendationAudience = "me"
): Promise<RecommendationRunResult> {
  // Stage logging so a hung run shows WHERE it hung in the runtime logs.
  const startedAt = Date.now();
  const mark = (stage: string) =>
    console.log(`recommend-run [${Math.round((Date.now() - startedAt) / 1000)}s] ${stage}`);

  mark("start: building taste summary");
  const { libraryJson, excludedTitles, activeRecTitles, dismissedFeedbackJson } =
    await buildTasteSummary();
  mark("taste summary built");
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const excludedKeys = new Set(excludedTitles.map(normalizeTitle));

  const cutoffDate = new Date();
  cutoffDate.setUTCMonth(cutoffDate.getUTCMonth() - RECENCY_MONTHS);
  const cutoffMonth = cutoffDate.toISOString().slice(0, 7);
  const cutoffDay = cutoffDate.toISOString().slice(0, 10);

  // Upcoming picks are welcome when clearly dated and premiering soon.
  const horizonDate = new Date();
  horizonDate.setUTCMonth(horizonDate.getUTCMonth() + UPCOMING_HORIZON_MONTHS);
  const horizonMonth = horizonDate.toISOString().slice(0, 7);
  const horizonDay = horizonDate.toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  // Candidate pools come from TMDB, not web search: release dates, platforms,
  // and streamability arrive pre-verified, so the Claude call only has to do
  // the taste matching. (Web search proved too unreliable to be load-bearing —
  // when it errored, every pass came back empty.)
  mark("fetching TMDB candidate pools");
  const [releasedPool, upcomingPool] = await Promise.all([
    discoverRecentCandidates({
      fromDate: cutoffDay,
      toDate: today,
      limit: 30,
      excludeTitleKeys: excludedKeys,
    }),
    discoverRecentCandidates({
      fromDate: tomorrow,
      toDate: horizonDay,
      limit: 10,
      excludeTitleKeys: excludedKeys,
      requireStreamable: false,
    }),
  ]);
  const releasedCandidates = releasedPool.filter(
    (candidate) => candidate.platform && candidate.releaseDate
  );
  const upcomingCandidates = upcomingPool.filter((candidate) => candidate.releaseDate);
  mark(
    `candidates: ${releasedCandidates.length} released, ${upcomingCandidates.length} upcoming`
  );
  if (releasedCandidates.length === 0) {
    throw new Error("TMDB returned no new streamable candidates");
  }
  const releasedByKey = new Map(
    releasedCandidates.map((candidate) => [normalizeTitle(candidate.title), candidate])
  );
  const upcomingByKey = new Map(
    upcomingCandidates.map((candidate) => [normalizeTitle(candidate.title), candidate])
  );

  function formatCandidate(candidate: DiscoverCandidate): string {
    const bits = [
      candidate.kind === "tv" ? "series" : "movie",
      `released ${candidate.releaseDate}`,
      candidate.platform ? `on ${candidate.platform}` : "",
      candidate.genres.length ? candidate.genres.join("/") : "",
      candidate.tmdbRating ? `TMDB ${candidate.tmdbRating.toFixed(1)}` : "",
    ].filter(Boolean);
    return `- ${candidate.title} (${bits.join(", ")})${
      candidate.overview ? ` — ${candidate.overview}` : ""
    }`;
  }

  function upcomingLabel(releaseDate: string): string {
    const hasDay = /^\d{4}-\d{2}-\d{2}/.test(releaseDate);
    const date = new Date(`${hasDay ? releaseDate.slice(0, 10) : `${releaseDate.slice(0, 7)}-01`}T00:00:00Z`);
    const sameYear = releaseDate.slice(0, 4) === today.slice(0, 4);
    const label = date.toLocaleDateString("en-US", {
      month: hasDay ? "short" : "long",
      ...(hasDay ? { day: "numeric" } : {}),
      ...(sameYear ? {} : { year: "numeric" }),
      timeZone: "UTC",
    });
    return `Coming ${label}`;
  }

  const audienceRule =
    audience === "both"
      ? "These picks are for Brittany and her husband Blake watching TOGETHER. " +
        "Anchor the shared taste in library shows tagged watched_with: 'blake' — those are their joint watches. " +
        "Favor tense, twisty shows that work as a couple's watch; skip anything that only fits her solo lane. "
      : "These picks are for Brittany watching solo. Shows tagged watched_with: 'blake' are joint watches — " +
        "still valid taste signal, but weight her solo favorites most. ";

  async function requestPicks(pass: string): Promise<RecommendationSheetEntry[]> {
    mark(`claude call start (${pass}, cutoff=${cutoffMonth})`);

    let rawText = "";
    const parsed = await askClaudeJson<{ recommendations?: RecommendationDraft[] }>({
      system:
        "You are Brittany's TV/movie recommendation agent. " +
        "You are given candidate pools pulled from TMDB — release dates, US streaming platforms, and " +
        "streamability are already verified, so trust them as-is; no research needed. " +
        "Pick the 3 titles from the RELEASED candidates that best fit her taste — plus, when one is a " +
        "genuinely exciting fit, 1 bonus pick from the UPCOMING candidates. " +
        "HARD RULE: choose ONLY from the candidate lists; never add a title that is not listed. " +
        "Copy title, release_date, platform, and type straight from the candidate entry; set available_now " +
        "to true for RELEASED picks and false for the UPCOMING pick. " +
        audienceRule +
        "Quality over quantity: she would rather get 1-2 genuine taste fits — or none at all today — " +
        "than a filler pick. Never pad the list with a mediocre fit; only recommend titles you'd " +
        "honestly score 7+ for her. " +
        TASTE_VOICE +
        ' Reply with JSON only: { "recommendations": [ ... ] }. Each item keys: ' +
        FIELD_SPEC +
        " For buzz_source, use the TMDB popularity/rating framing or what the premise promises — no invented press quotes.",
      user:
        `Today's date: ${today}\n` +
        `\nHer ratings library (most recent / highest rated):\n${libraryJson}\n\n` +
        `Recs she dismissed, with her reasons (treat as avoid-patterns):\n${dismissedFeedbackJson}\n\n` +
        `Already visible active recs (pick different titles):\n- ${activeRecTitles.join("\n- ") || "(none)"}\n\n` +
        `RELEASED candidates (streamable in the US now):\n${releasedCandidates.map(formatCandidate).join("\n")}\n\n` +
        `UPCOMING candidates (premiere dates confirmed):\n${upcomingCandidates.map(formatCandidate).join("\n") || "(none)"}`,
      // No web search: the pool is pre-verified, so this is a pure taste-
      // matching call — fast and immune to search-tool outages.
      webSearches: 0,
      effort: "low",
      maxTokens: 4096,
      timeoutMs: 300_000,
      maxRetries: 0,
      onText: (text) => {
        rawText = text;
      },
    });
    const drafts = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
    mark(`claude call done (${pass}, drafts=${drafts.length})`);
    if (drafts.length === 0) {
      // The model's prose usually says WHY it came back empty — surface it.
      mark(`empty drafts, response text head: ${rawText.slice(0, 800)}`);
    }
    const kept = drafts
      .map(normalizeRecommendationDraft)
      .filter((entry): entry is RecommendationSheetEntry => entry != null)
      .filter((entry) => !excludedKeys.has(normalizeTitle(entry.title)))
      // Anchor every pick to its TMDB candidate: a title outside the pool is
      // dropped, and the candidate's verified date/platform win over the
      // model's copy.
      .map((entry) => {
        const key = normalizeTitle(entry.title);
        const released = releasedByKey.get(key);
        const upcoming = upcomingByKey.get(key);
        const candidate = released ?? upcoming;
        if (!candidate) return null;
        return {
          ...entry,
          title: candidate.title,
          // Released picks keep the usual YYYY-MM; upcoming keep the exact
          // premiere day for the "Coming <date>" label.
          release_date: released
            ? candidate.releaseDate.slice(0, 7)
            : candidate.releaseDate,
          platform: candidate.platform || entry.platform,
          type: entry.type || (candidate.kind === "tv" ? "Series" : "Movie"),
          available_now: Boolean(released),
        };
      })
      .filter((entry): entry is RecommendationSheetEntry => entry != null)
      // Hard gates: released picks must be streamable now with a release
      // month that is not in the future and (when a cutoff applies) not too
      // old. Upcoming picks are allowed only with a premiere inside the
      // horizon — and get a "Coming <date>" label so the card says so.
      .filter((entry) => {
        const month = entry.release_date.slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(month)) return false;
        if (entry.available_now) {
          if (month > currentMonth) return false;
          return month >= cutoffMonth;
        }
        return month > currentMonth && month <= horizonMonth;
      })
      .map((entry) =>
        entry.available_now
          ? entry
          : {
              ...entry,
              why_options_positive: [upcomingLabel(entry.release_date), entry.why_options_positive]
                .filter(Boolean)
                .join(" | "),
            }
      )
      // Watchable-now picks first, then the dated upcoming bonus.
      .sort((a, b) => Number(b.available_now) - Number(a.available_now))
      .slice(0, 4);

    if (kept.length === 0 && drafts.length > 0) {
      // Show WHAT the gates rejected, so a bad run is diagnosable from logs.
      mark(
        `all drafts filtered out: ${drafts
          .map((d) => `${d?.title} (${d?.release_date}, now=${d?.available_now})`)
          .join("; ")}`
      );
    }
    return kept;
  }

  // A stalled/failed first pass must not kill the run — the retry pass
  // below covers it. Both passes carry the same recency cutoff: an old
  // catalog title never comes in, not even as a fallback. A dry day beats
  // a stale pick.
  let entries: RecommendationSheetEntry[] = [];
  let firstPassError: unknown = null;
  try {
    entries = await requestPicks("first pass");
  } catch (error) {
    firstPassError = error;
    mark(`first pass failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // If nothing watchable-now survived (an upcoming bonus alone doesn't
  // count), take one more new-releases-only swing. A failed retry must not
  // throw away what the first pass DID yield.
  if (!entries.some((entry) => entry.available_now)) {
    try {
      const seen = new Set(entries.map((entry) => normalizeTitle(entry.title)));
      const retry = (await requestPicks("retry pass")).filter(
        (entry) => entry.available_now && !seen.has(normalizeTitle(entry.title))
      );
      entries = [...retry, ...entries];
    } catch (error) {
      mark(`retry pass failed: ${error instanceof Error ? error.message : String(error)}`);
      if (entries.length === 0 && firstPassError) throw firstPassError;
      if (entries.length === 0) throw error;
    }
    if (entries.length > 0 && firstPassError) {
      console.error("recommendation first pass failed, retry pass covered:", firstPassError);
    }
  }

  if (entries.length === 0) {
    throw new Error("No valid new recommendations were generated");
  }

  if (audience === "both") {
    entries = entries.map((entry) => ({
      ...entry,
      why_options_positive: ["For you + Blake", entry.why_options_positive]
        .filter(Boolean)
        .join(" | "),
    }));
  }

  mark(`appending ${entries.length} picks`);
  const { ids } = await appendRecommendations(entries);
  mark(`done: appended ${ids.length}`);
  return { added: ids.length, ids };
}

export interface TitleProfileHints {
  title: string;
  platform?: string;
  release_date?: string;
  type?: string;
  watch_status?: string;
}

async function loadRecommendations(): Promise<Recommendation[]> {
  const rows = await getSheetRows(SHEET_TABS.RECOMMENDATIONS);
  return mapRecommendations(rows);
}

async function markRecommendationAccepted(rec: Recommendation): Promise<Recommendation> {
  if (rec.user_action.trim().toLowerCase() === "accept") {
    return rec;
  }

  await updateSheetField(SHEET_TABS.RECOMMENDATIONS, rec.id, "user_action", "accept");
  return { ...rec, user_action: "accept" };
}

async function generateTitleProfile(hints: TitleProfileHints): Promise<RecommendationSheetEntry> {
  const { libraryJson } = await buildTasteSummary();
  const title = hints.title.trim();

  // Ground the profile in TMDB — with web search unreliable, an unanchored
  // model call once profiled a completely different show under her title
  // ('Hacks' came back as a Nantucket wedding mystery on Netflix).
  const hintKind = hints.type ? inferMediaKind(hints.type) : undefined;
  const resolved = await resolveTmdbTitle(title, hintKind, {
    releaseDate: hints.release_date,
    skipPlatform: Boolean(hints.platform?.trim()),
  });

  const metadata = [
    hints.platform ? `platform: ${hints.platform}` : "",
    hints.release_date ? `release: ${hints.release_date}` : "",
    hints.type ? `type: ${hints.type}` : "",
    hints.watch_status ? `watch_status: ${hints.watch_status}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  const verifiedBlock = resolved
    ? [
        `canonical title: ${resolved.canonicalTitle}`,
        resolved.releaseDate ? `first released: ${resolved.releaseDate}` : "",
        resolved.platform ? `platform: ${resolved.platform}` : "",
        resolved.mediaTypeLabel ? `type: ${resolved.mediaTypeLabel}` : "",
        resolved.genres.length ? `genres: ${resolved.genres.join(", ")}` : "",
        resolved.overview ? `synopsis: ${resolved.overview}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const parsed = await askClaudeJson<{ recommendation?: RecommendationDraft }>({
    system:
      "You are Brittany's TV/movie recommendation agent. " +
      TASTE_VOICE +
      " She manually added a title to her library — profile THIS exact title for her taste, honestly. " +
      "The verified TMDB metadata below is ground truth: never contradict it and never describe a " +
      "different show under this title. If the show is a weak fit for her taste, say so with a low " +
      "fit_score and honest cautions — she added it herself, so a low score is fine. " +
      ' Reply with JSON only: { "recommendation": { ... } }. Fields: ' +
      FIELD_SPEC +
      " Title must match exactly.",
    user:
      `Title to profile: "${title}"` +
      (metadata ? `\nKnown metadata: ${metadata}` : "") +
      (verifiedBlock ? `\n\nVerified TMDB metadata (ground truth):\n${verifiedBlock}` : "") +
      `\n\nHer ratings library (most recent / highest rated):\n${libraryJson}`,
    webSearches: 0,
    maxTokens: 4096,
    effort: "low",
  });

  const draft = normalizeRecommendationDraft(
    parsed.recommendation ?? ({} as RecommendationDraft)
  );
  if (!draft) {
    throw new Error("Could not profile this title");
  }

  // Her row and TMDB outrank whatever the model wrote for the factual fields.
  const merged = mergeDraftWithHints(draft, hints);
  return {
    ...merged,
    platform: hints.platform?.trim() || resolved?.platform || merged.platform,
    release_date: hints.release_date?.trim() || resolved?.releaseDate || merged.release_date,
    type: hints.type?.trim() || resolved?.mediaTypeLabel || merged.type,
  };
}

/**
 * Ensure a recommendation row with full profile fields exists for a manually
 * added title. Returns null (without writing) when no API key is configured
 * so adding shows still works on an unconfigured deploy.
 */
export async function ensureProfileForTitle(
  hints: TitleProfileHints
): Promise<Recommendation | null> {
  const title = hints.title.trim();
  if (!title) return null;
  if (!isClaudeConfigured()) return null;

  const recommendations = await loadRecommendations();
  const existing = findRecommendationForTitle(title, recommendations);

  if (
    existing &&
    existing.fit_score > 0 &&
    (existing.the_hook || existing.why_she_will_love_it)
  ) {
    return markRecommendationAccepted(existing);
  }

  const entry = await generateTitleProfile(hints);
  const { ids } = await appendRecommendations([entry], { userAction: "accept" });
  const id = ids[0];
  if (!id) return null;

  const refreshed = await loadRecommendations();
  const created = refreshed.find((rec) => rec.id === id);
  return created ?? null;
}
