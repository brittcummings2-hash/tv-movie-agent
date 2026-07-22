import type { ParsedWatchEntry } from "./parse-entry";
import { resolveTmdbTitle, type MediaKind } from "./tmdb";

export interface EnrichedWatchEntry extends ParsedWatchEntry {
  release_date: string;
  type_hint?: string;
}

export async function enrichWatchEntry(parsed: ParsedWatchEntry): Promise<EnrichedWatchEntry> {
  const hintKind: MediaKind | undefined =
    parsed.media_kind === "movie" ? "movie" : parsed.media_kind === "tv" ? "tv" : undefined;

  const resolved = await resolveTmdbTitle(parsed.show_title, hintKind);

  return {
    ...parsed,
    show_title: resolved?.canonicalTitle ?? parsed.show_title,
    release_date: resolved?.releaseDate ?? "",
    platform: parsed.platform || resolved?.platform || "",
    type_hint: resolved
      ? resolved.episodeCount
        ? `${resolved.mediaTypeLabel} | ${resolved.episodeCount} episodes`
        : resolved.mediaTypeLabel
      : "",
  };
}

export function enrichedToSheetRow(entry: EnrichedWatchEntry, id: string, today: string) {
  return [
    id,
    entry.show_title,
    String(entry.rating),
    entry.release_date,
    entry.platform,
    entry.watch_status,
    "",
    entry.comments,
    today,
    today,
  ];
}
