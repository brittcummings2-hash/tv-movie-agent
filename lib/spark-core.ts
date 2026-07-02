import { filterActiveRecommendations, normalizeTitle } from "./search";
import { getSheetRows, type RecommendationSheetEntry } from "./sheets";
import { mapRecommendations, mapUserRatings } from "./mappers";
import { SHEET_TABS } from "./types";

export interface SparkRecommendationDraft {
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

export const SPARK_TASTE_VOICE =
  "She loves female-led mysteries, morally gray leads, layered mysteries, unpredictable twists, " +
  "obsessive characters, elite worlds, smart writing, satisfying endings, and quality true crime. " +
  "Avoid: too slow, overhyped docuseries, romance-heavy plots, procedural slog, bleak with no payoff, male-led unless exceptional. " +
  "Weight 5-star ratings and why_reasons tags heavily; treat dnf as hard avoid patterns.";

export const SPARK_FIELD_SPEC =
  "title, release_date (YYYY-MM), platform, type, fit_score (1-10), available_now (boolean), " +
  "why_she_will_love_it, the_hook, comp_shows (array of 2-3 titles from her library), caution, buzz_source, " +
  "why_options_positive (pipe-separated tags like Contemporary | True crime | Limited series), " +
  "why_options_negative (pipe-separated short cautions).";

export async function buildTasteSummary(): Promise<{
  libraryJson: string;
  excludedTitles: string[];
  activeRecTitles: string[];
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

  return {
    libraryJson: JSON.stringify(tasteRows, null, 2),
    excludedTitles,
    activeRecTitles: activeRecommendations.map((rec) => rec.title),
  };
}

export function normalizeSparkDraft(entry: SparkRecommendationDraft): RecommendationSheetEntry | null {
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

export async function callSparkGemini(body: Record<string, unknown>): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Spark request failed: ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error("Spark returned no content");
  return raw;
}

export function titleMatches(a: string, b: string): boolean {
  return normalizeTitle(a) === normalizeTitle(b);
}
