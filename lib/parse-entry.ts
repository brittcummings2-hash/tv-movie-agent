import { askClaudeJson, isClaudeConfigured } from "./claude";
import { normalizeWatchStatus } from "./watch-stages";

export type WatchStatus = "watched" | "watching" | "caught_up" | "want_to_watch" | "dnf";

export { normalizeWatchStatus };

export interface ParsedWatchEntry {
  show_title: string;
  rating: number;
  platform: string;
  watch_status: WatchStatus;
  comments: string;
  media_kind: "tv" | "movie" | "unknown";
}

function clampRating(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(5, Math.max(0, Math.round(n)));
}

function inferMediaKindFromText(text: string): ParsedWatchEntry["media_kind"] {
  if (/\bmovie\b|\bfilm\b/i.test(text)) return "movie";
  if (/\bshow\b|\bseries\b|\bseason\b|\bs\d+\b/i.test(text)) return "tv";
  return "unknown";
}

function inferWatchStatusFromText(text: string): WatchStatus {
  if (/\bdnf\b|didn't finish|did not finish/i.test(text)) return "dnf";
  if (/\bwant to watch\b|\bplan to watch\b|\badd to (?:my )?list\b|\bon my list\b/i.test(text)) {
    return "want_to_watch";
  }
  if (/\bin the middle of\b|\bhalfway through\b|\bcurrently watching\b|\bwatching\b|\bstarted\b/i.test(text)) {
    return "watching";
  }
  return "watched";
}

function extractShowTitle(text: string): string {
  let title = text.trim();

  const addToStatus = title.match(
    /^add\s+(.+?)\s+to\s+(?:currently\s+)?(?:watching|in progress|want to watch|my list|queue|watchlist)$/i
  );
  if (addToStatus) return addToStatus[1].trim();

  title = title.replace(/\s+to\s+(?:currently\s+)?(?:watching|in progress|want to watch|my list|queue|watchlist)$/i, "");
  title = title.replace(/^add\s+/i, "");
  title = title
    .replace(
      /^(?:just\s+)?(?:finished|watched|saw|want to watch|plan to watch|in the middle of|currently watching|watching|started)\s+/i,
      ""
    )
    .replace(/\b(?:on|via)\s+[A-Za-z0-9+]+(?:\s+[A-Za-z0-9+]+)?/gi, "")
    .replace(/\b([0-5])\s*(?:\/\s*5|stars?)\b/gi, "")
    .replace(/\bdnf\b/gi, "")
    .replace(/[,\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return title;
}

function fallbackParse(message: string): ParsedWatchEntry {
  let text = message.trim();
  const watch_status = inferWatchStatusFromText(text);
  const media_kind = inferMediaKindFromText(text);

  let rating = 0;
  const ratingMatch = text.match(/\b([0-5])\s*(?:\/\s*5|stars?)\b/i);
  if (ratingMatch) rating = Number(ratingMatch[1]);

  let platform = "";
  const platformMatch = text.match(/\b(?:on|via)\s+([A-Za-z0-9+]+(?:\s+[A-Za-z0-9+]+)?)/i);
  if (platformMatch) platform = platformMatch[1].trim();

  let comments = "";
  const commaParts = text.split(",");
  if (commaParts.length > 1) {
    const last = commaParts[commaParts.length - 1].trim();
    if (last && !/\d\s*star/i.test(last) && !/^(on|via)\s/i.test(last)) {
      comments = last;
      text = commaParts.slice(0, -1).join(",");
    }
  }

  const title = extractShowTitle(text);

  return {
    show_title: title || message.trim(),
    rating,
    platform,
    watch_status,
    comments,
    media_kind,
  };
}

export function sanitizeShowTitle(title: string): string {
  const cleaned = extractShowTitle(title);
  return cleaned || title.trim();
}

export async function parseWatchMessage(message: string): Promise<ParsedWatchEntry> {
  const text = message.trim();
  if (!text) {
    throw new Error('Say what you’re watching, e.g. “In the middle of Shogun” or “Want to watch Severance”.');
  }

  if (!isClaudeConfigured()) {
    return fallbackParse(text);
  }

  try {
    const parsed = await askClaudeJson<Partial<ParsedWatchEntry>>({
      system:
        "Extract a TV/movie watch-log row from casual speech. Return JSON only with keys: " +
        "show_title (string, core title without season noise when possible), rating (0-5 integer), " +
        'platform (string, "" if unknown), watch_status (one of: watched, watching, want_to_watch, dnf), ' +
        "comments (string), media_kind (tv, movie, or unknown). " +
        "Map: finished/watched -> watched; in the middle of/currently watching -> watching; want to watch -> want_to_watch.",
      user: text,
      maxTokens: 1024,
    });

    const show_title = sanitizeShowTitle(String(parsed.show_title ?? ""));
    if (!show_title) return fallbackParse(text);

    const mediaKind = String(parsed.media_kind ?? "unknown").toLowerCase();
    return {
      show_title,
      rating: clampRating(parsed.rating),
      platform: String(parsed.platform ?? "").trim(),
      watch_status: normalizeWatchStatus(parsed.watch_status),
      comments: String(parsed.comments ?? "").trim(),
      media_kind: mediaKind === "movie" ? "movie" : mediaKind === "tv" ? "tv" : "unknown",
    };
  } catch {
    return fallbackParse(text);
  }
}
