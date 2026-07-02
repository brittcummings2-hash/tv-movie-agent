import { findRecommendationForTitle } from "./search";
import {
  buildTasteSummary,
  callSparkGemini,
  mergeDraftWithHints,
  normalizeSparkDraft,
  SPARK_FIELD_SPEC,
  SPARK_TASTE_VOICE,
  type SparkRecommendationDraft,
} from "./spark-core";
import { mapRecommendations } from "./mappers";
import { appendRecommendations, getSheetRows, updateSheetField, type RecommendationSheetEntry } from "./sheets";
import type { Recommendation } from "./types";
import { SHEET_TABS } from "./types";

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

  const raw = await callSparkGemini({
    systemInstruction: {
      parts: [
        {
          text:
            "You are Brittany's TV/movie recommendation agent (Spark). " +
            SPARK_TASTE_VOICE +
            " She manually added a title to her library — profile THIS exact title for her taste. " +
            "Return JSON only: { \"recommendation\": { ... } }. Fields: " +
            SPARK_FIELD_SPEC +
            " Real US streaming title only. Title must match exactly.",
        },
      ],
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              `Title to profile: "${title}"` +
              (metadata ? `\nKnown metadata: ${metadata}` : "") +
              `\n\nHer ratings library (most recent / highest rated):\n${libraryJson}`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.5,
    },
  });

  const parsed = JSON.parse(raw) as { recommendation?: SparkRecommendationDraft };
  const draft = normalizeSparkDraft(parsed.recommendation ?? ({} as SparkRecommendationDraft));
  if (!draft) {
    throw new Error("Spark could not profile this title");
  }

  return mergeDraftWithHints(draft, hints);
}

/** Ensure a sheet recommendation row exists with full Spark fields for a manually added title. */
export async function ensureSparkProfileForTitle(
  hints: TitleProfileHints
): Promise<Recommendation | null> {
  const title = hints.title.trim();
  if (!title) return null;

  if (!process.env.GEMINI_API_KEY?.trim()) {
    return null;
  }

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
