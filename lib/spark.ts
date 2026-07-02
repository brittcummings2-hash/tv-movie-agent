import { filterActiveRecommendations, normalizeTitle } from "./search";
import { appendRecommendations, type RecommendationSheetEntry } from "./sheets";
import {
  buildTasteSummary,
  callSparkGemini,
  normalizeSparkDraft,
  SPARK_FIELD_SPEC,
  SPARK_TASTE_VOICE,
  type SparkRecommendationDraft,
} from "./spark-core";

export interface SparkRunResult {
  added: number;
  ids: string[];
}

export async function runSparkRecommendations(): Promise<SparkRunResult> {
  const { libraryJson, excludedTitles, activeRecTitles } = await buildTasteSummary();
  const excludedBlock = excludedTitles.slice(0, 120).join("\n- ");

  const raw = await callSparkGemini({
    systemInstruction: {
      parts: [
        {
          text:
            "You are Brittany's TV/movie recommendation agent (Spark). " +
            "Recommend 3 fresh, currently watchable US streaming titles she has NOT seen. " +
            SPARK_TASTE_VOICE +
            " Return JSON only: { \"recommendations\": [ ... ] }. Each item keys: " +
            SPARK_FIELD_SPEC +
            " Never recommend excluded titles. Real shows only.",
        },
      ],
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              `Her ratings library (most recent / highest rated):\n${libraryJson}\n\n` +
              `Already visible active recs (pick different titles):\n- ${activeRecTitles.join("\n- ") || "(none)"}\n\n` +
              `Excluded titles (never recommend):\n- ${excludedBlock}`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
    },
  });

  const parsed = JSON.parse(raw) as { recommendations?: SparkRecommendationDraft[] };
  const drafts = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];

  const excludedKeys = new Set(excludedTitles.map(normalizeTitle));
  const entries = drafts
    .map(normalizeSparkDraft)
    .filter((entry): entry is RecommendationSheetEntry => entry != null)
    .filter((entry) => !excludedKeys.has(normalizeTitle(entry.title)))
    .slice(0, 4);

  if (entries.length === 0) {
    throw new Error("Spark did not return any valid new recommendations");
  }

  const { ids } = await appendRecommendations(entries);
  return { added: ids.length, ids };
}
