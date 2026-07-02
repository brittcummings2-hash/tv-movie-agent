import { inferMediaKind, resolveTmdbTitle } from "./tmdb";

export interface StructuredWatchEntry {
  show_title: string;
  rating: number;
  release_date: string;
  platform: string;
  watch_status: string;
  why_reasons?: string;
  comments: string;
  media_kind?: "tv" | "movie";
  type_hint?: string;
}

export async function enrichStructuredEntry(
  entry: StructuredWatchEntry
): Promise<StructuredWatchEntry> {
  const hintKind =
    entry.media_kind === "movie" ? "movie" : entry.media_kind === "tv" ? "tv" : undefined;

  const resolved = await resolveTmdbTitle(entry.show_title, hintKind, {
    releaseDate: entry.release_date,
  });

  const typeHint = resolved
    ? resolved.episodeCount
      ? `${resolved.mediaTypeLabel} | ${resolved.episodeCount} episodes`
      : resolved.mediaTypeLabel
    : "";

  return {
    ...entry,
    release_date: entry.release_date || resolved?.releaseDate || "",
    platform: entry.platform || resolved?.platform || "",
    type_hint: typeHint,
  };
}

export function structuredFromRecommendation(item: {
  title: string;
  release_date: string;
  platform: string;
  type: string;
  watch_status: string;
}): StructuredWatchEntry {
  return {
    show_title: item.title,
    rating: 0,
    release_date: item.release_date,
    platform: item.platform,
    watch_status: item.watch_status,
    comments: "",
    media_kind: inferMediaKind(item.type) === "movie" ? "movie" : "tv",
  };
}
