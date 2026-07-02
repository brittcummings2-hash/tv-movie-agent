import { NextResponse } from "next/server";
import { mapEpisodeAlerts, mapRecommendations, mapUserRatings } from "@/lib/mappers";
import { getCached, setCached } from "@/lib/sheet-cache";
import { getSheetRows } from "@/lib/sheets";
import { formatGoogleSheetsError } from "@/lib/sheets-error";
import type { EpisodeAlert, Recommendation, UserRating } from "@/lib/types";
import { SHEET_TABS } from "@/lib/types";

const CACHE_KEY = "bootstrap:all";
const CACHE_TTL_MS = 5 * 60_000;

export interface BootstrapPayload {
  library: UserRating[];
  recommendations: Recommendation[];
  alerts: EpisodeAlert[];
}

export async function GET() {
  try {
    const cached = getCached<BootstrapPayload>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached, { headers: { "Cache-Control": "no-store" } });
    }

    const [ratingsRows, recsRows, alertsRows] = await Promise.all([
      getSheetRows(SHEET_TABS.USER_RATINGS),
      getSheetRows(SHEET_TABS.RECOMMENDATIONS),
      getSheetRows(SHEET_TABS.EPISODE_ALERTS),
    ]);

    const payload: BootstrapPayload = {
      library: mapUserRatings(ratingsRows),
      recommendations: mapRecommendations(recsRows).sort((a, b) => b.fit_score - a.fit_score),
      alerts: mapEpisodeAlerts(alertsRows).filter((item) => !item.seen),
    };

    setCached(CACHE_KEY, payload, CACHE_TTL_MS);
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = formatGoogleSheetsError(error);
    console.error("bootstrap failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
