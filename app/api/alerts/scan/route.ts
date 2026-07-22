import { NextResponse, type NextRequest } from "next/server";
import { mapEpisodeAlerts, mapUserRatings } from "@/lib/mappers";
import { invalidateCachedPrefix } from "@/lib/sheet-cache";
import { normalizeTitle } from "@/lib/search";
import { appendEpisodeAlerts, getSheetRows, type EpisodeAlertSheetEntry } from "@/lib/sheets";
import { fetchTvEpisodeStatus, resolveTmdbTitle } from "@/lib/tmdb";
import { SHEET_TABS } from "@/lib/types";
import {
  isPortalAuthEnabled,
  isValidSessionToken,
  PORTAL_SESSION_COOKIE,
} from "@/lib/portal-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** How far back a drop can be and still produce an alert (daily cron + margin). */
const LOOKBACK_DAYS = 10;

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return true;
  }
  if (!isPortalAuthEnabled()) return true;
  const session = request.cookies.get(PORTAL_SESSION_COOKIE)?.value;
  return isValidSessionToken(session);
}

function daysAgo(dateStr: string): number {
  const dropped = new Date(`${dateStr}T00:00:00Z`).getTime();
  if (!Number.isFinite(dropped)) return Number.POSITIVE_INFINITY;
  return (Date.now() - dropped) / (24 * 60 * 60 * 1000);
}

function formatDropDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Match "Episode N" (and "Season M" when present) so re-scans don't re-alert. */
function alertCoversEpisode(alertText: string, season: number, episode: number): boolean {
  const episodeMatch = alertText.match(/Episode\s+(\d+)/i);
  if (!episodeMatch || Number(episodeMatch[1]) !== episode) return false;
  const seasonMatch = alertText.match(/Season\s+(\d+)/i);
  return !seasonMatch || Number(seasonMatch[1]) === season;
}

/** Daily cron: deterministic new-episode alerts from TMDB air dates. */
export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [ratingRows, alertRows] = await Promise.all([
      getSheetRows(SHEET_TABS.USER_RATINGS),
      getSheetRows(SHEET_TABS.EPISODE_ALERTS),
    ]);

    const watchingShows = mapUserRatings(ratingRows).filter((item) => {
      const status = item.watch_status.toLowerCase();
      return status === "watching" || status === "caught_up";
    });
    const existingAlerts = mapEpisodeAlerts(alertRows);

    const newAlerts: EpisodeAlertSheetEntry[] = [];
    const seenKeys = new Set<string>();

    for (const show of watchingShows) {
      const resolved = await resolveTmdbTitle(show.show_title, "tv", {
        releaseDate: show.release_date,
        skipPlatform: Boolean(show.platform.trim()),
      });
      if (!resolved?.tmdbId || resolved.mediaKind !== "tv") continue;

      const status = await fetchTvEpisodeStatus(resolved.tmdbId);
      const last = status?.last;
      if (!last || daysAgo(last.airDate) > LOOKBACK_DAYS || daysAgo(last.airDate) < 0) continue;

      const showKey = normalizeTitle(show.show_title);
      const dedupeKey = `${showKey}|S${last.season}E${last.episode}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      const alreadyAlerted = existingAlerts.some(
        (alert) =>
          normalizeTitle(alert.show_title) === showKey &&
          alertCoversEpisode(alert.alert_text, last.season, last.episode)
      );
      if (alreadyAlerted) continue;

      const platform = show.platform.trim() || resolved.platform;
      const episodeLabel =
        last.season > 1
          ? `Season ${last.season}, Episode ${last.episode}`
          : `Episode ${last.episode}`;
      const nameLabel = last.name ? ` ('${last.name}')` : "";
      const platformLabel = platform ? ` on ${platform}` : "";

      newAlerts.push({
        show_title: show.show_title,
        alert_text: `${episodeLabel}${nameLabel} dropped on ${formatDropDate(last.airDate)}${platformLabel}.`,
      });
    }

    if (newAlerts.length > 0) {
      await appendEpisodeAlerts(newAlerts);
      invalidateCachedPrefix("alerts:");
      invalidateCachedPrefix("bootstrap:");
    }

    return NextResponse.json({
      ok: true,
      scanned: watchingShows.length,
      added: newAlerts.length,
      alerts: newAlerts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Alert scan failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
