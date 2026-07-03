import { inferMediaKind, resolveTmdbTitle, type MediaKind } from "./tmdb";

export interface PosterRequestItem {
  id: string;
  title: string;
  type?: string;
  kind?: MediaKind;
  releaseDate?: string;
}

export interface LibraryMediaMetadata {
  posters: Record<string, string | null>;
  overviews: Record<string, string | null>;
  platforms: Record<string, string>;
  releaseDates: Record<string, string>;
  episodeCounts: Record<string, number | null>;
  nextEpisodes: Record<string, string | null>;
  seriesStatuses: Record<string, string | null>;
  trailers: Record<string, string | null>;
}

const CONCURRENCY = 12;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

function lookupKey(item: PosterRequestItem): string {
  const kind = item.kind ?? (item.type ? inferMediaKind(item.type) : "auto");
  return `${kind}:${item.releaseDate ?? ""}:${item.title.trim().toLowerCase()}`;
}

function resolveKind(item: PosterRequestItem): MediaKind | undefined {
  if (item.kind) return item.kind;
  if (item.type) return inferMediaKind(item.type);
  return undefined;
}

export async function resolveLibraryMedia(items: PosterRequestItem[]): Promise<LibraryMediaMetadata> {
  const uniqueByKey = new Map<string, PosterRequestItem>();
  const idsByKey = new Map<string, string[]>();

  for (const item of items) {
    if (!item.title.trim()) continue;
    const key = lookupKey(item);
    if (!uniqueByKey.has(key)) uniqueByKey.set(key, item);
    const ids = idsByKey.get(key) ?? [];
    ids.push(item.id);
    idsByKey.set(key, ids);
  }

  const uniqueEntries = [...uniqueByKey.entries()];
  const resolvedEntries = await mapWithConcurrency(uniqueEntries, CONCURRENCY, async ([key, item]) => {
    const result = await resolveTmdbTitle(item.title, resolveKind(item), {
      releaseDate: item.releaseDate,
      skipPlatform: false,
    });
    return [key, result] as const;
  });

  const keyToResult = new Map(resolvedEntries);
  const posters: Record<string, string | null> = {};
  const overviews: Record<string, string | null> = {};
  const platforms: Record<string, string> = {};
  const releaseDates: Record<string, string> = {};
  const episodeCounts: Record<string, number | null> = {};
  const nextEpisodes: Record<string, string | null> = {};
  const seriesStatuses: Record<string, string | null> = {};
  const trailers: Record<string, string | null> = {};

  for (const [key, ids] of idsByKey) {
    const result = keyToResult.get(key);
    for (const id of ids) {
      posters[id] = result?.posterUrl ?? null;
      overviews[id] = result?.overview?.trim() || null;
      platforms[id] = result?.platform ?? "";
      releaseDates[id] = result?.releaseDate ?? "";
      episodeCounts[id] = result?.episodeCount ?? null;
      nextEpisodes[id] = result?.nextEpisodeAirDate ?? null;
      seriesStatuses[id] = result?.seriesStatus ?? null;
      trailers[id] = result?.trailerUrl ?? null;
    }
  }

  return { posters, overviews, platforms, releaseDates, episodeCounts, nextEpisodes, seriesStatuses, trailers };
}

/** @deprecated Use resolveLibraryMedia */
export async function resolvePosters(
  items: PosterRequestItem[]
): Promise<Record<string, string | null>> {
  const { posters } = await resolveLibraryMedia(items);
  return posters;
}
