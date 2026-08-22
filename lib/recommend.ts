import { filterActiveRecommendations, findRecommendationForTitle, normalizeTitle } from "./search";
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

  const excludedTitles = [
    ...new Set(
      [
        ...library.map((item) => item.show_title),
        ...recommendations
          .filter((rec) => {
            const action = rec.user_action.trim().toLowerCase();
            return action === "accept" || action === "dismiss";
          })
          .map((rec) => rec.title),
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
  const excludedBlock = excludedTitles.slice(0, 120).join("\n- ");
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const excludedKeys = new Set(excludedTitles.map(normalizeTitle));

  const cutoffDate = new Date();
  cutoffDate.setUTCMonth(cutoffDate.getUTCMonth() - RECENCY_MONTHS);
  const cutoffMonth = cutoffDate.toISOString().slice(0, 7);

  // Upcoming picks are welcome when clearly dated and premiering soon.
  const horizonDate = new Date();
  horizonDate.setUTCMonth(horizonDate.getUTCMonth() + UPCOMING_HORIZON_MONTHS);
  const horizonMonth = horizonDate.toISOString().slice(0, 7);

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

  async function requestPicks(minMonth: string | null): Promise<RecommendationSheetEntry[]> {
    mark(`claude call start (minMonth=${minMonth ?? "open"})`);
    const recencyRule = minMonth
      ? "HARD RULE 2: only NEW shows — first released within the last " +
        `${RECENCY_MONTHS} months (release month on or after the cutoff given below). ` +
        "An older title is never acceptable, no matter how well it fits; pick a different new one instead. "
      : "The catalog is open: any release age is fine as long as it is a strong taste fit " +
        "she has NOT seen, but still prefer the newest options available. ";

    const parsed = await askClaudeJson<{ recommendations?: RecommendationDraft[] }>({
      system:
        "You are Brittany's TV/movie recommendation agent. " +
        "Recommend exactly 3 fresh, currently watchable US streaming titles she has NOT seen — " +
        "plus, when a genuinely exciting fit exists, 1 UPCOMING title as a bonus fourth pick. " +
        "HARD RULE 1: the 3 main titles must be fully released and streamable in the US TODAY — use web search " +
        "to verify the release date and platform; never pass off upcoming or announced-only titles as watchable. " +
        "The optional upcoming pick is the one exception: it must have a confirmed US premiere date within the " +
        `next ${UPCOMING_HORIZON_MONTHS} months — set available_now to false and release_date to the exact ` +
        "premiere date as YYYY-MM-DD (skip the upcoming pick if you cannot confirm an exact date). " +
        recencyRule +
        audienceRule +
        "Prefer the newest, currently-buzzing releases; source the buzz claim from your search. " +
        TASTE_VOICE +
        ' After any searching, end your reply with JSON only: { "recommendations": [ ... ] }. Each item keys: ' +
        FIELD_SPEC +
        " Never recommend excluded titles. Real shows only.",
      user:
        `Today's date: ${today}\n` +
        (minMonth ? `Recency cutoff: only titles first released in ${minMonth} or later.\n` : "") +
        `\nHer ratings library (most recent / highest rated):\n${libraryJson}\n\n` +
        `Recs she dismissed, with her reasons (treat as avoid-patterns):\n${dismissedFeedbackJson}\n\n` +
        `Already visible active recs (pick different titles):\n- ${activeRecTitles.join("\n- ") || "(none)"}\n\n` +
        `Excluded titles (never recommend):\n- ${excludedBlock}`,
      // Must finish inside Vercel's function window even with the fallback
      // pass — 5 minutes per call, no SDK retry (the fallback is the retry).
      // Kept deliberately light: at effort "medium" with 3 searches this
      // call deliberated past every timeout (a 12s profile call proved the
      // API itself was fine), so picks ran dry for weeks.
      webSearches: 2,
      effort: "low",
      maxTokens: 4096,
      timeoutMs: 300_000,
      maxRetries: 0,
    });
    mark(`claude call done (minMonth=${minMonth ?? "open"})`);

    const drafts = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
    return drafts
      .map(normalizeRecommendationDraft)
      .filter((entry): entry is RecommendationSheetEntry => entry != null)
      .filter((entry) => !excludedKeys.has(normalizeTitle(entry.title)))
      // Hard gates: released picks must be streamable now with a release
      // month that is not in the future and (when a cutoff applies) not too
      // old. Upcoming picks are allowed only with a premiere inside the
      // horizon — and get a "Coming <date>" label so the card says so.
      .filter((entry) => {
        const month = entry.release_date.slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(month)) return false;
        if (entry.available_now) {
          if (month > currentMonth) return false;
          return minMonth ? month >= minMonth : true;
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
  }

  // A stalled/failed first pass must not kill the run — the catalog pass
  // below doubles as its retry.
  let entries: RecommendationSheetEntry[] = [];
  let firstPassError: unknown = null;
  try {
    entries = await requestPicks(cutoffMonth);
  } catch (error) {
    firstPassError = error;
    mark(`first pass failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Safety net: if nothing watchable-now survived (an upcoming bonus alone
  // doesn't count), dip into the catalog once — labeled so the cards say so.
  if (!entries.some((entry) => entry.available_now)) {
    const catalog = (await requestPicks(null))
      .filter((entry) => entry.available_now)
      .map((entry) => ({
        ...entry,
        why_options_positive: ["Catalog pick", entry.why_options_positive]
          .filter(Boolean)
          .join(" | "),
      }));
    entries = [...catalog, ...entries];
    if (entries.length > 0 && firstPassError) {
      console.error("recommendation first pass failed, catalog pass covered:", firstPassError);
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
  const metadata = [
    hints.platform ? `platform: ${hints.platform}` : "",
    hints.release_date ? `release: ${hints.release_date}` : "",
    hints.type ? `type: ${hints.type}` : "",
    hints.watch_status ? `watch_status: ${hints.watch_status}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  const parsed = await askClaudeJson<{ recommendation?: RecommendationDraft }>({
    system:
      "You are Brittany's TV/movie recommendation agent. " +
      TASTE_VOICE +
      " She manually added a title to her library — profile THIS exact title for her taste. " +
      "If the title is recent or unfamiliar, use web search to confirm what it is. " +
      ' After any searching, end your reply with JSON only: { "recommendation": { ... } }. Fields: ' +
      FIELD_SPEC +
      " Real US streaming title only. Title must match exactly.",
    user:
      `Title to profile: "${title}"` +
      (metadata ? `\nKnown metadata: ${metadata}` : "") +
      `\n\nHer ratings library (most recent / highest rated):\n${libraryJson}`,
    webSearches: 1,
    maxTokens: 4096,
    effort: "low",
  });

  const draft = normalizeRecommendationDraft(
    parsed.recommendation ?? ({} as RecommendationDraft)
  );
  if (!draft) {
    throw new Error("Could not profile this title");
  }

  return mergeDraftWithHints(draft, hints);
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
