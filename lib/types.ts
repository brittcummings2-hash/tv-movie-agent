export const SHEET_TABS = {
  USER_RATINGS: "user_ratings",
  RECOMMENDATIONS: "recommendations",
  DAILY_DIGEST: "daily_digest",
  EPISODE_ALERTS: "episode_alerts",
} as const;

export type WatchStatus = "watched" | "dnf" | string;

export interface UserRating {
  id: string;
  rowIndex: number;
  show_title: string;
  rating: number;
  release_date: string;
  platform: string;
  watch_status: WatchStatus;
  why_reasons: string;
  comments: string;
  created_at: string;
  updated_at: string;
  posterUrl?: string | null;
}

export interface Recommendation {
  id: string;
  rowIndex: number;
  digest_date: string;
  title: string;
  release_date: string;
  platform: string;
  type: string;
  fit_score: number;
  available_now: boolean;
  why_she_will_love_it: string;
  the_hook: string;
  comp_shows: string[];
  caution: string;
  buzz_source: string;
  why_options_positive: string;
  why_options_negative: string;
  user_action: string;
  user_rating: string;
  user_reasons: string;
  user_comments: string;
  created_at: string;
  posterUrl?: string | null;
  heroUrl?: string | null;
}

export interface DailyDigest {
  id: string;
  digest_date: string;
  recommendations: { title: string }[];
  new_episode_alerts: unknown[];
  created_at: string;
}

export interface EpisodeAlert {
  id: string;
  rowIndex: number;
  alert_date: string;
  show_title: string;
  alert_text: string;
  her_rating: string;
  seen: boolean;
  created_at: string;
  posterUrl?: string | null;
}

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}
