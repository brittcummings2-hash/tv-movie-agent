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
  "Avoid: too slow, overhyped docuseries, romance-heavy plots, procedural slog, bleak with no payoff, male-led unless exceptional. " +
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
  const normalizedRelease = /^\d{4}-\d{2}/.test(releaseDate)
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

/** Generate fresh recommendation rows — replaces the external Spark agent's refresh. */
export async function runRecommendationRefresh(): Promise<RecommendationRunResult> {
  const { libraryJson, excludedTitles, activeRecTitles, dismissedFeedbackJson } =
    await buildTasteSummary();
  const excludedBlock = excludedTitles.slice(0, 120).join("\n- ");
  const today = new Date().toISOString().slice(0, 10);

  const parsed = await askClaudeJson<{ recommendations?: RecommendationDraft[] }>({
    system:
      "You are Brittany's TV/movie recommendation agent. " +
      "Recommend 3 fresh, currently watchable US streaming titles she has NOT seen — " +
      "prefer recent releases and current buzz; use web search to verify each title is real, " +
      "currently streamable in the US, and to source the buzz claim. " +
      TASTE_VOICE +
      ' After any searching, end your reply with JSON only: { "recommendations": [ ... ] }. Each item keys: ' +
      FIELD_SPEC +
      " Never recommend excluded titles. Real shows only.",
    user:
      `Today's date: ${today}\n\n` +
      `Her ratings library (most recent / highest rated):\n${libraryJson}\n\n` +
      `Recs she dismissed, with her reasons (treat as avoid-patterns):\n${dismissedFeedbackJson}\n\n` +
      `Already visible active recs (pick different titles):\n- ${activeRecTitles.join("\n- ") || "(none)"}\n\n` +
      `Excluded titles (never recommend):\n- ${excludedBlock}`,
    // Must finish inside Vercel's 60s function window.
    webSearches: 3,
    effort: "medium",
  });

  const drafts = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
  const excludedKeys = new Set(excludedTitles.map(normalizeTitle));
  const entries = drafts
    .map(normalizeRecommendationDraft)
    .filter((entry): entry is RecommendationSheetEntry => entry != null)
    .filter((entry) => !excludedKeys.has(normalizeTitle(entry.title)))
    .slice(0, 4);

  if (entries.length === 0) {
    throw new Error("No valid new recommendations were generated");
  }

  const { ids } = await appendRecommendations(entries);
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
