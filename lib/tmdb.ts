const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export type MediaKind = "tv" | "movie";

export interface TmdbImages {
  posterUrl: string | null;
  heroUrl: string | null;
}

const cache = new Map<string, { data: TmdbImages; expires: number }>();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function cacheKey(title: string, kind: MediaKind): string {
  return `${kind}:${title.trim().toLowerCase()}`;
}

function getAuthHeaders(): HeadersInit {
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

function getApiKeyParam(): string {
  return process.env.TMDB_API_KEY?.trim() ?? "";
}

export function inferMediaKind(typeField: string): MediaKind {
  const value = typeField.toLowerCase();
  if (value.includes("series") || value.includes("tv") || value.includes("episode")) {
    return "tv";
  }
  return "movie";
}

export function buildPosterUrl(path: string | null | undefined, size = "w342"): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function buildHeroUrl(path: string | null | undefined, size = "w780"): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

async function tmdbFetch(path: string): Promise<Response | null> {
  const apiKey = getApiKeyParam();
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  if (!apiKey && !token) return null;

  const url = new URL(`https://api.themoviedb.org/3${path}`);
  if (apiKey) url.searchParams.set("api_key", apiKey);

  try {
    const res = await fetch(url.toString(), {
      headers: getAuthHeaders(),
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    return res;
  } catch {
    return null;
  }
}

interface TmdbSearchResult {
  results?: Array<{
    poster_path?: string | null;
    backdrop_path?: string | null;
  }>;
}

export async function lookupTmdbImages(title: string, kind: MediaKind): Promise<TmdbImages> {
  const key = cacheKey(title, kind);
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expires) {
    return cached.data;
  }

  const empty: TmdbImages = { posterUrl: null, heroUrl: null };
  if (!title.trim()) return empty;

  const endpoint = kind === "tv" ? "/search/tv" : "/search/movie";
  const res = await tmdbFetch(`${endpoint}?query=${encodeURIComponent(title.trim())}&page=1`);
  if (!res) return empty;

  const data = (await res.json()) as TmdbSearchResult;
  const match = data.results?.[0];
  if (!match) return empty;

  const images: TmdbImages = {
    posterUrl: buildPosterUrl(match.poster_path),
    heroUrl: buildHeroUrl(match.backdrop_path ?? match.poster_path),
  };

  cache.set(key, { data: images, expires: Date.now() + CACHE_TTL_MS });
  return images;
}

export async function enrichWithImages<T extends { title?: string; show_title?: string; type?: string }>(
  items: T[],
  options?: { hero?: boolean; kind?: MediaKind }
): Promise<(T & TmdbImages)[]> {
  return Promise.all(
    items.map(async (item) => {
      const title = item.title ?? item.show_title ?? "";
      const kind = options?.kind ?? (item.type ? inferMediaKind(item.type) : "tv");
      const images = await lookupTmdbImages(title, kind);
      return {
        ...item,
        posterUrl: images.posterUrl,
        heroUrl: options?.hero ? images.heroUrl : null,
      };
    })
  );
}
