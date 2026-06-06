import type {
  DailyDigest,
  EpisodeAlert,
  Recommendation,
  UserRating,
} from "./types";
import { inferMediaKind, lookupTmdbImages } from "./tmdb";

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

export function mapUserRatings(rows: Record<string, string | number>[]): UserRating[] {
  return rows.map((row) => ({
    id: String(row.id ?? ""),
    rowIndex: Number(row._sheet_row ?? 0),
    show_title: String(row.show_title ?? ""),
    rating: Number(row.rating ?? 0),
    release_date: String(row.release_date ?? ""),
    platform: String(row.platform ?? ""),
    watch_status: String(row.watch_status ?? ""),
    why_reasons: String(row.why_reasons ?? ""),
    comments: String(row.comments ?? ""),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  }));
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
    user_action: String(row.user_action ?? ""),
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
      const images = await lookupTmdbImages(item.show_title, "tv");
      return { ...item, posterUrl: images.posterUrl };
    })
  );
}

export async function attachRecommendationImages(items: Recommendation[]): Promise<Recommendation[]> {
  return Promise.all(
    items.map(async (item) => {
      const kind = inferMediaKind(item.type);
      const images = await lookupTmdbImages(item.title, kind);
      return { ...item, posterUrl: images.posterUrl, heroUrl: images.heroUrl };
    })
  );
}

export async function attachAlertImages(items: EpisodeAlert[]): Promise<EpisodeAlert[]> {
  return Promise.all(
    items.map(async (item) => {
      const images = await lookupTmdbImages(item.show_title, "tv");
      return { ...item, posterUrl: images.posterUrl };
    })
  );
}
