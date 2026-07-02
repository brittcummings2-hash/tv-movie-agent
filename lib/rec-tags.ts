import type { Recommendation, UserRating } from "./types";
import { formatReleaseLabel, formatScoreOutOfTen } from "./tmdb";
import { RATING_TIER_LABELS } from "./finish-tags";

function normalizeTag(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function splitListTags(value: string): string[] {
  if (!value.trim()) return [];
  return value
    .split(/[|,;]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.length <= 48);
}

function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const trimmed = formatTagLabel(tag);
    if (!trimmed) continue;
    const key = normalizeTag(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

/** "Complex protagonist" → "Complex Protagonist", "Non-Procedural" unchanged */
export function formatTagLabel(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) =>
      word
        .split("-")
        .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : ""))
        .join("-")
    )
    .join(" ");
}

function typeLabel(type: string): string {
  return type.split("|")[0]?.trim() ?? type.trim();
}

export function parseEpisodeCountFromType(type: string): number | null {
  const match = type.match(/(\d+)\s*episodes?/i);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isFinite(count) && count > 0 ? count : null;
}

function formatEpisodeLabel(count: number | null | undefined): string {
  if (!count || count <= 0) return "";
  return count === 1 ? "1 episode" : `${count} episodes`;
}

export function buildCardMeta(options: {
  platform?: string;
  releaseDate?: string;
  score?: number | null;
  episodeCount?: number | null;
  availableNow?: boolean;
}): string {
  const releaseLabel = options.releaseDate ? formatReleaseLabel(options.releaseDate) : "";
  const episodeLabel = formatEpisodeLabel(options.episodeCount);

  let tail = "";
  if (options.score && options.score > 0) {
    tail = formatScoreOutOfTen(options.score);
  } else if (options.availableNow === false) {
    tail = "Coming soon";
  }

  return [options.platform?.trim(), releaseLabel, episodeLabel, tail].filter(Boolean).join(" · ");
}

export function buildRecommendationMeta(item: Recommendation): string {
  return buildCardMeta({
    platform: item.platform,
    releaseDate: item.release_date,
    score: item.fit_score,
    episodeCount: parseEpisodeCountFromType(item.type),
    availableNow: item.available_now,
  });
}

function metaExclusions(item: Recommendation): Set<string> {
  const releaseLabel = item.release_date ? formatReleaseLabel(item.release_date) : "";
  const type = typeLabel(item.type);
  const episodeLabel = formatEpisodeLabel(parseEpisodeCountFromType(item.type));
  const scoreLabel =
    item.fit_score > 0 ? formatScoreOutOfTen(item.fit_score).toLowerCase() : "";
  const keys = [
    item.platform,
    type,
    releaseLabel,
    item.release_date,
    episodeLabel,
    scoreLabel,
    "coming soon",
    ...type.split(/\s+/),
  ];
  return new Set(keys.map(normalizeTag).filter(Boolean));
}

function filterMetaDuplicates(tags: string[], exclusions: Set<string>): string[] {
  return tags.filter((tag) => {
    const key = normalizeTag(tag);
    if (!key || exclusions.has(key)) return false;
    for (const excluded of exclusions) {
      if (excluded.length >= 4 && (key.includes(excluded) || excluded.includes(key))) {
        return false;
      }
    }
    return true;
  });
}

export function buildRecommendationTags(item: Recommendation): string[] {
  const exclusions = metaExclusions(item);

  return filterMetaDuplicates(
    uniqueTags([
      ...splitListTags(item.why_options_positive),
      ...splitListTags(item.why_options_negative),
    ]),
    exclusions
  ).slice(0, 8);
}

export function buildLibraryCardContent(
  item: Pick<
    UserRating,
    | "platform"
    | "release_date"
    | "show_title"
    | "why_reasons"
    | "comments"
    | "overview"
    | "episode_count"
  >,
  recommendation: Recommendation | undefined,
  showRecContent: boolean
): { meta: string; description?: string; tags: string[] } {
  if (showRecContent && recommendation) {
    return {
      meta: buildRecommendationMeta(recommendation),
      description: recommendation.the_hook || recommendation.why_she_will_love_it,
      tags: buildRecommendationTags(recommendation),
    };
  }

  const finishTags = uniqueTags(splitListTags(item.why_reasons ?? ""));
  const comment = item.comments?.trim() ?? "";
  const tierLabels = new Set(Object.values(RATING_TIER_LABELS).map((label) => label.toLowerCase()));
  const commentDescription =
    comment && !tierLabels.has(comment.toLowerCase()) ? comment : undefined;
  const description = item.overview?.trim() || commentDescription;

  return {
    meta: buildCardMeta({
      platform: item.platform,
      releaseDate: item.release_date,
      episodeCount: item.episode_count,
    }),
    description,
    tags: finishTags,
  };
}
