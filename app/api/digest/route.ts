import { NextResponse } from "next/server";
import { getCached, setCached } from "@/lib/sheet-cache";
import { getSheetRows } from "@/lib/sheets";
import { mapDailyDigest } from "@/lib/mappers";
import { SHEET_TABS } from "@/lib/types";

const CACHE_KEY = "digest:latest";

export async function GET() {
  try {
    const cached = getCached<ReturnType<typeof mapDailyDigest>>(CACHE_KEY);
    if (cached !== null && cached !== undefined) {
      return NextResponse.json({ digest: cached }, { headers: { "Cache-Control": "no-store" } });
    }

    const rows = await getSheetRows(SHEET_TABS.DAILY_DIGEST);
    const digest = mapDailyDigest(rows);
    setCached(CACHE_KEY, digest);
    return NextResponse.json({ digest }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load digest";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
