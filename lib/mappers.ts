import type {
  DailyDigest,
  EpisodeAlert,
  Recommendation,
  UserRating,
} from "./types";
import { inferMediaKind, resolveTmdbTitle } from "./tmdb";
import { normalizeWatchStatus } from "./watch-stages";

export function parseJsonArray(value: string): string[] {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function parseBool(value: string): boolean {
  return value.trim().toUpperCase() === "TRUE";
}

export function parseRating(value: string | number): number {
  if (typeof value === "number") {
    return clampRating(value);
  }
  const trimmed = value.trim();
  if (!trimmed) return 0;

  const fraction = trimmed.match(/^(\d+(?:\.\d+)?)\s*\/\s*5$/);
  if (fraction) return clampRating(Number(fraction[1]));

  const stars = trimmed.match(/^(\d+(?:\.\d+)?)\s*stars?$/i);
  if (stars) return clampRating(Number(stars[1]));

  return clampRating(Number(trimmed));
}

function clampRating(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(5, Math.round(value)));
}

export function mapUserRatings(rows: Record<string, string | number>[]): UserRating[] {
  return rows.map((row) => ({
    id: String(row.id ?? ""),
    rowIndex: Number(row._sheet_row ?? 0),
    show_title: String(row.show_title ?? ""),
    rating: parseRating(row.rating ?? 0),
    release_date: String(row.release_date ?? ""),
    platform: String(row.platform ?? ""),
    watch_status: normalizeWatchStatus(row.watch_status),
    why_reasons: String(row.why_reasons ?? ""),
    comments: String(row.comments ?? ""),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    current_season: Math.max(0, Math.floor(Number(row.current_season ?? 0)) || 0),
    current_episode: Math.max(0, Math.floor(Number(row.current_episode ?? 0)) || 0),
  }));
}

/** Accept/dismiss briefly wrote to why_options_negative before user_action column was fixed. */
function resolveRecommendationUserAction(row: Record<string, string | number>): string {
  const action = String(row.user_action ?? "").trim();
  if (action) return action;

  const misplaced = String(row.why_options_negative ?? "").trim().toLowerCase();
  if (misplaced === "accept" || misplaced === "dismiss") return misplaced;

  return "";
}

export function mapRecommendations(rows: Record<string, string | number>[]): Recommendation[] {
  return rows.map((row) => ({
    id: String(row.id ?? ""),
    rowIndex: Number(row._sheet_row ?? 0),
    digest_date: String(row.digest_date ?? ""),
    title: String(row.title ?? ""),
    release_date: String(row.release_date ?? ""),
    platform: String(row.platform ?? ""),
    type: String(row.type ?? ""),
    fit_score: Number(row.fit_score ?? 0),
    available_now: parseBool(String(row.available_now ?? "")),
    why_she_will_love_it: String(row.why_she_will_love_it ?? ""),
    the_hook: String(row.the_hook ?? ""),
    comp_shows: parseJsonArray(String(row.comp_shows ?? "")),
    caution: String(row.caution ?? ""),
    buzz_source: String(row.buzz_source ?? ""),
    why_options_positive: String(row.why_options_positive ?? ""),
    why_options_negative: String(row.why_options_negative ?? ""),
    user_action: resolveRecommendationUserAction(row),
    user_rating: String(row.user_rating ?? ""),
    user_reasons: String(row.user_reasons ?? ""),
    user_comments: String(row.user_comments ?? ""),
    created_at: String(row.created_at ?? ""),
  }));
}

export function mapDailyDigest(rows: Record<string, string | number>[]): DailyDigest | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) =>
    String(b.digest_date ?? "").localeCompare(String(a.digest_date ?? ""))
  );
  const row = sorted[0];
  let recommendations: { title: string }[] = [];
  let new_episode_alerts: unknown[] = [];
  try {
    recommendations = JSON.parse(String(row.recommendations ?? "[]"));
  } catch {
    recommendations = [];
  }
  try {
    new_episode_alerts = JSON.parse(String(row.new_episode_alerts ?? "[]"));
  } catch {
    new_episode_alerts = [];
  }
  return {
    id: String(row.id ?? ""),
    digest_date: String(row.digest_date ?? ""),
    recommendations,
    new_episode_alerts,
    created_at: String(row.created_at ?? ""),
  };
}

export function mapEpisodeAlerts(rows: Record<string, string | number>[]): EpisodeAlert[] {
  return rows
    .map((row) => ({
      id: String(row.id ?? ""),
      rowIndex: Number(row._sheet_row ?? 0),
      alert_date: String(row.alert_date ?? ""),
      show_title: String(row.show_title ?? ""),
      alert_text: String(row.alert_text ?? ""),
      her_rating: String(row.her_rating ?? ""),
      seen: parseBool(String(row.seen ?? "")),
      created_at: String(row.created_at ?? ""),
    }))
    .filter((row) => row.show_title.trim() || row.alert_text.trim());
}

export async function attachRatingImages(items: UserRating[]): Promise<UserRating[]> {
  return Promise.all(
    items.map(async (item) => {
      const resolved = await resolveTmdbTitle(item.show_title, undefined, {
        releaseDate: item.release_date,
        skipPlatform: Boolean(item.platform.trim()),
      });
      return {
        ...item,
        posterUrl: resolved?.posterUrl ?? null,
        overview: resolved?.overview?.trim() || null,
        episode_count: resolved?.episodeCount ?? null,
        release_date: item.release_date || resolved?.releaseDate || "",
        platform: item.platform || resolved?.platform || "",
        next_episode_air_date: resolved?.nextEpisodeAirDate ?? null,
        series_status: resolved?.seriesStatus ?? null,
        trailerUrl: resolved?.trailerUrl ?? null,
      };
    })
  );
}

export async function attachRecommendationImages(items: Recommendation[]): Promise<Recommendation[]> {
  return Promise.all(
    items.map(async (item) => {
      const kind = inferMediaKind(item.type);
      const resolved = await resolveTmdbTitle(item.title, kind, {
        releaseDate: item.release_date,
        skipPlatform: true,
      });
      return {
        ...item,
        posterUrl: resolved?.posterUrl ?? null,
        heroUrl: resolved?.heroUrl ?? null,
        trailerUrl: resolved?.trailerUrl ?? null,
      };
    })
  );
}

export async function attachAlertImages(items: EpisodeAlert[]): Promise<EpisodeAlert[]> {
  return Promise.all(
    items.map(async (item) => {
      const resolved = await resolveTmdbTitle(item.show_title, "tv", { skipPlatform: true });
      return { ...item, posterUrl: resolved?.posterUrl ?? null };
    })
  );
}
