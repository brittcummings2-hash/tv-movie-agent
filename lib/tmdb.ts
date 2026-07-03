const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export type MediaKind = "tv" | "movie";

export interface TmdbImages {
  posterUrl: string | null;
  heroUrl: string | null;
}

export interface TmdbResolveResult extends TmdbImages {
  canonicalTitle: string;
  releaseDate: string;
  platform: string;
  mediaKind: MediaKind;
  mediaTypeLabel: string;
  episodeCount: number | null;
  tmdbRating: number | null;
  tmdbId: number | null;
  overview: string;
  genres: string[];
  nextEpisodeAirDate: string | null;
  seriesStatus: string | null;
  trailerUrl: string | null;
}

const cache = new Map<string, { data: TmdbResolveResult | null; expires: number }>();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getAuthHeaders(): HeadersInit {
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

function getWatchRegion(): string {
  return process.env.TMDB_WATCH_REGION?.trim().toUpperCase() || "US";
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

export function formatReleaseLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^(\d{4})(?:-(\d{2}))?(?:-\d{2})?$/);
  if (!match) return trimmed;
  const year = match[1];
  const month = match[2];
  if (!month) return year;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export interface NextEpisodeInfo {
  label: string;
  tone: "scheduled" | "waiting" | "ended";
}

/** Turn TMDB next-episode/status into a short card line. Null if nothing useful. */
export function formatNextEpisode(
  nextEpisodeAirDate: string | null | undefined,
  seriesStatus: string | null | undefined
): NextEpisodeInfo | null {
  const date = (nextEpisodeAirDate ?? "").trim();
  if (date) {
    const parsed = new Date(`${date}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      const label = parsed.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      return { label: `Next episode · ${label}`, tone: "scheduled" };
    }
  }
  const status = (seriesStatus ?? "").trim().toLowerCase();
  if (status === "ended" || status === "canceled" || status === "cancelled") {
    return { label: "Series ended", tone: "ended" };
  }
  if (status === "returning series" || status === "in production" || status === "planned") {
    return { label: "Waiting on next season", tone: "waiting" };
  }
  return null;
}

function formatReleaseDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  return parts[0] ?? "";
}

function stripSeasonInfo(title: string): string {
  return title
    .replace(/\bseason\s*\d+\b/gi, "")
    .replace(/\bs\d+\s*(?:&\s*s\d+)*/gi, "")
    .replace(/\bS\d+\s*(?:&\s*S\d+)*\b/g, "")
    .replace(/\s*&\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSearchQueries(title: string): string[] {
  const queries: string[] = [];
  const seen = new Set<string>();

  function add(query: string) {
    const q = query.trim();
    if (!q) return;
    const key = q.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    queries.push(q);
  }

  add(title);
  const stripped = stripSeasonInfo(title);
  add(stripped);

  if (!stripped.toLowerCase().startsWith("the ")) {
    add(`The ${stripped}`);
  } else {
    add(stripped.slice(4).trim());
  }

  return queries;
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

interface TmdbSearchItem {
  id?: number;
  name?: string;
  title?: string;
  overview?: string;
  first_air_date?: string;
  release_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  popularity?: number;
  vote_count?: number;
}

interface WatchProvider {
  provider_name?: string;
  display_priority?: number;
}

interface WatchProvidersResponse {
  results?: Record<
    string,
    {
      flatrate?: WatchProvider[];
      free?: WatchProvider[];
      ads?: WatchProvider[];
      rent?: WatchProvider[];
      buy?: WatchProvider[];
    }
  >;
}

const PLATFORM_PRIORITY = [
  "netflix",
  "hulu",
  "max",
  "hbo",
  "disney",
  "apple tv",
  "prime video",
  "amazon",
  "peacock",
  "paramount",
];

function pickStreamingPlatform(providers: WatchProvider[]): string {
  if (providers.length === 0) return "";

  const sorted = [...providers].sort(
    (a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999)
  );

  for (const needle of PLATFORM_PRIORITY) {
    const match = sorted.find((p) =>
      (p.provider_name ?? "").toLowerCase().includes(needle)
    );
    if (match?.provider_name) return match.provider_name;
  }

  return sorted[0]?.provider_name ?? "";
}

async function fetchWatchPlatform(id: number, kind: MediaKind): Promise<string> {
  const region = getWatchRegion();
  const path = kind === "tv" ? `/tv/${id}/watch/providers` : `/movie/${id}/watch/providers`;
  const res = await tmdbFetch(path);
  if (!res) return "";

  const data = (await res.json()) as WatchProvidersResponse;
  const regionData = data.results?.[region];
  if (!regionData) return "";

  const streaming =
    regionData.flatrate ??
    regionData.free ??
    regionData.ads ??
    regionData.rent ??
    regionData.buy ??
    [];

  return pickStreamingPlatform(streaming);
}

function parseReleaseYear(value: string | undefined | null): number | undefined {
  const match = value?.trim().match(/^(\d{4})/);
  return match ? Number(match[1]) : undefined;
}

export function parseReleaseYearHint(value: string | undefined | null): number | undefined {
  return parseReleaseYear(value);
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function searchTmdb(
  query: string,
  kind: MediaKind,
  year?: number
): Promise<TmdbSearchItem[]> {
  const endpoint = kind === "tv" ? "/search/tv" : "/search/movie";
  const params = new URLSearchParams({
    query,
    page: "1",
  });
  if (year) {
    if (kind === "tv") params.set("first_air_date_year", String(year));
    else params.set("primary_release_year", String(year));
  }
  const res = await tmdbFetch(`${endpoint}?${params.toString()}`);
  if (!res) return [];
  const data = (await res.json()) as { results?: TmdbSearchItem[] };
  return data.results ?? [];
}

function getItemYear(item: TmdbSearchItem, kind: MediaKind): number | null {
  const raw = kind === "tv" ? item.first_air_date : item.release_date;
  if (!raw) return null;
  const year = Number(raw.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function scoreMatch(
  query: string,
  item: TmdbSearchItem,
  kind: MediaKind,
  releaseYearHint?: number
): number {
  const name = (kind === "tv" ? item.name : item.title) ?? "";
  const qNorm = normalizeTitle(query);
  const nNorm = normalizeTitle(name);
  const itemYear = getItemYear(item, kind);
  let score = (item.popularity ?? 0) * 0.35 + (item.vote_count ?? 0) * 0.04;

  const exactMatch = qNorm === nNorm;
  const closeMatch = qNorm.includes(nNorm) || nNorm.includes(qNorm);

  if (exactMatch) score += 220;
  else if (closeMatch) score += 100;
  else if (qNorm.split(" ").every((word) => word.length > 2 && nNorm.includes(word))) score += 60;
  else score -= 40;

  if (releaseYearHint && itemYear) {
    const diff = Math.abs(itemYear - releaseYearHint);
    if (diff === 0) score += 200;
    else if (diff <= 1) score += 140;
    else if (diff <= 3) score += 70;
    else if (itemYear < releaseYearHint - 8) score -= 120;
  } else if (exactMatch || closeMatch) {
    if (itemYear && itemYear >= 2015) score += 45;
    if (itemYear && itemYear < 1990) score -= 90;
  }

  if (item.poster_path) score += 8;
  return score;
}

export function formatMediaTypeLabel(
  kind: MediaKind,
  seasons?: number | null,
  episodes?: number | null
): string {
  if (kind === "movie") return "Movie";
  if (seasons === 1 && episodes && episodes <= 12) return "Limited Series";
  return "Series";
}

export function formatScoreOutOfTen(score: number): string {
  const rounded = Math.round(score * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}/10` : `${rounded.toFixed(1)}/10`;
}

interface TmdbVideo {
  site?: string;
  type?: string;
  key?: string;
  official?: boolean;
}

function pickTrailerUrl(videos: TmdbVideo[]): string | null {
  const youtube = videos.filter((video) => video.site === "YouTube" && video.key);
  const pick =
    youtube.find((video) => video.type === "Trailer" && video.official) ??
    youtube.find((video) => video.type === "Trailer") ??
    youtube.find((video) => video.type === "Teaser");
  return pick?.key ? `https://www.youtube.com/watch?v=${pick.key}` : null;
}

async function fetchDetail(
  id: number,
  kind: MediaKind
): Promise<{
  overview: string;
  genres: string[];
  episodeCount: number | null;
  seasonCount: number | null;
  tmdbRating: number | null;
  nextEpisodeAirDate: string | null;
  seriesStatus: string | null;
  trailerUrl: string | null;
}> {
  const path = kind === "tv" ? `/tv/${id}` : `/movie/${id}`;
  const res = await tmdbFetch(`${path}?append_to_response=videos`);
  if (!res) {
    return {
      overview: "",
      genres: [],
      episodeCount: null,
      seasonCount: null,
      tmdbRating: null,
      nextEpisodeAirDate: null,
      seriesStatus: null,
      trailerUrl: null,
    };
  }

  const data = (await res.json()) as {
    overview?: string;
    genres?: Array<{ name?: string }>;
    number_of_episodes?: number;
    number_of_seasons?: number;
    vote_average?: number;
    status?: string;
    next_episode_to_air?: { air_date?: string } | null;
    videos?: { results?: TmdbVideo[] };
  };

  const genres = (data.genres ?? [])
    .map((genre) => String(genre.name ?? "").trim())
    .filter(Boolean);

  const vote = Number(data.vote_average);
  const tmdbRating = Number.isFinite(vote) && vote > 0 ? vote : null;

  return {
    overview: String(data.overview ?? "").trim(),
    genres,
    episodeCount:
      kind === "tv" && Number(data.number_of_episodes) > 0 ? Number(data.number_of_episodes) : null,
    seasonCount:
      kind === "tv" && Number(data.number_of_seasons) > 0 ? Number(data.number_of_seasons) : null,
    tmdbRating,
    nextEpisodeAirDate:
      kind === "tv" ? data.next_episode_to_air?.air_date?.trim() || null : null,
    seriesStatus: kind === "tv" ? String(data.status ?? "").trim() || null : null,
    trailerUrl: pickTrailerUrl(data.videos?.results ?? []),
  };
}

async function toResolveResult(
  item: TmdbSearchItem,
  kind: MediaKind,
  fallbackTitle: string,
  skipPlatform = false
): Promise<TmdbResolveResult> {
  const canonicalTitle = (kind === "tv" ? item.name : item.title) ?? fallbackTitle;
  const releaseDate = formatReleaseDate(kind === "tv" ? item.first_air_date : item.release_date);
  const platform =
    skipPlatform || !item.id ? "" : await fetchWatchPlatform(item.id, kind);

  let overview = String(item.overview ?? "").trim();
  let genres: string[] = [];
  let episodeCount: number | null = null;
  let seasonCount: number | null = null;
  let tmdbRating: number | null = null;
  let nextEpisodeAirDate: string | null = null;
  let seriesStatus: string | null = null;
  let trailerUrl: string | null = null;
  if (item.id) {
    const detail = await fetchDetail(item.id, kind);
    if (!overview) overview = detail.overview;
    genres = detail.genres;
    episodeCount = detail.episodeCount;
    seasonCount = detail.seasonCount;
    tmdbRating = detail.tmdbRating;
    nextEpisodeAirDate = detail.nextEpisodeAirDate;
    seriesStatus = detail.seriesStatus;
    trailerUrl = detail.trailerUrl;
  }

  return {
    canonicalTitle,
    releaseDate,
    platform,
    posterUrl: buildPosterUrl(item.poster_path),
    heroUrl: buildHeroUrl(item.backdrop_path ?? item.poster_path),
    mediaKind: kind,
    mediaTypeLabel: formatMediaTypeLabel(kind, seasonCount, episodeCount),
    episodeCount,
    tmdbRating,
    tmdbId: item.id ?? null,
    overview,
    genres,
    nextEpisodeAirDate,
    seriesStatus,
    trailerUrl,
  };
}

export async function resolveTmdbTitle(
  title: string,
  hintKind?: MediaKind,
  options?: { releaseYearHint?: number; releaseDate?: string; skipPlatform?: boolean }
): Promise<TmdbResolveResult | null> {
  const releaseYearHint =
    options?.releaseYearHint ?? parseReleaseYear(options?.releaseDate ?? "");
  const skipPlatform = options?.skipPlatform ?? false;
  const cacheKey = `${hintKind ?? "auto"}:${releaseYearHint ?? "any"}:${skipPlatform ? "lite" : "full"}:${title.trim().toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expires) {
    return cached.data;
  }

  if (!title.trim()) {
    return null;
  }

  const queries = normalizeSearchQueries(title);
  const kinds: MediaKind[] = hintKind ? [hintKind] : ["tv", "movie"];

  let bestItem: TmdbSearchItem | null = null;
  let bestKind: MediaKind = "tv";
  let bestScore = Number.NEGATIVE_INFINITY;

  function pickBest(item: TmdbSearchItem, kind: MediaKind, score: number) {
    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
      bestKind = kind;
    }
  }

  for (const query of queries) {
    for (const kind of kinds) {
      if (releaseYearHint) {
        const yearResults = await searchTmdb(query, kind, releaseYearHint);
        await considerResults(yearResults, kind, query, releaseYearHint, pickBest);
        if (yearResults.length === 0) {
          await considerResults(
            await searchTmdb(query, kind),
            kind,
            query,
            releaseYearHint,
            pickBest
          );
        }
      } else {
        await considerResults(
          await searchTmdb(query, kind),
          kind,
          query,
          releaseYearHint,
          pickBest
        );
      }
    }
  }

  if (bestItem && isYearMismatch(getItemYear(bestItem, bestKind), releaseYearHint)) {
    bestItem = null;
  }

  const resolved = bestItem
    ? await toResolveResult(bestItem, bestKind, title, skipPlatform)
    : null;
  cache.set(cacheKey, { data: resolved, expires: Date.now() + CACHE_TTL_MS });
  return resolved;
}

function isYearMismatch(itemYear: number | null, releaseYearHint?: number): boolean {
  if (!releaseYearHint || !itemYear) return false;
  return releaseYearHint >= 2015 && itemYear < 1990;
}

async function considerResults(
  results: TmdbSearchItem[],
  kind: MediaKind,
  query: string,
  releaseYearHint: number | undefined,
  pickBest: (item: TmdbSearchItem, kind: MediaKind, score: number) => void
) {
  for (const item of results.slice(0, 10)) {
    const itemYear = getItemYear(item, kind);
    if (isYearMismatch(itemYear, releaseYearHint)) continue;
    const score = scoreMatch(query, item, kind, releaseYearHint);
    pickBest(item, kind, score);
  }
}

export async function lookupTmdbImages(title: string, kind: MediaKind): Promise<TmdbImages> {
  const resolved = await resolveTmdbTitle(title, kind);
  if (!resolved) {
    return { posterUrl: null, heroUrl: null };
  }
  return { posterUrl: resolved.posterUrl, heroUrl: resolved.heroUrl };
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
