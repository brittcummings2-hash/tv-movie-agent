import { NextResponse } from "next/server";
import { getCached, invalidateCachedPrefix, setCached } from "@/lib/sheet-cache";
import { getSheetRows, updateSheetFieldByRow } from "@/lib/sheets";
import { attachAlertImages, mapEpisodeAlerts } from "@/lib/mappers";
import { SHEET_TABS } from "@/lib/types";

const CACHE_KEY = "alerts:unread";

export async function GET() {
  try {
    const cached = getCached<Awaited<ReturnType<typeof attachAlertImages>>>(CACHE_KEY);
    if (cached) {
      return NextResponse.json({ items: cached }, { headers: { "Cache-Control": "no-store" } });
    }

    const rows = await getSheetRows(SHEET_TABS.EPISODE_ALERTS);
    const unread = mapEpisodeAlerts(rows).filter((item) => !item.seen);
    const items = await attachAlertImages(unread);
    setCached(CACHE_KEY, items);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load alerts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = String(body.id ?? "");
    const rowIndex = Number(body.rowIndex ?? 0);

    if (id) {
      const { updateSheetField } = await import("@/lib/sheets");
      const result = await updateSheetField(SHEET_TABS.EPISODE_ALERTS, id, "seen", "TRUE");
      if (result.status === "error") {
        return NextResponse.json({ error: "Update failed" }, { status: 404 });
      }
    } else if (rowIndex > 0) {
      const result = await updateSheetFieldByRow(SHEET_TABS.EPISODE_ALERTS, rowIndex, "seen", "TRUE");
      if (result.status === "error") {
        return NextResponse.json({ error: "Update failed" }, { status: 404 });
      }
    } else {
      return NextResponse.json({ error: "Missing id or rowIndex" }, { status: 400 });
    }

    invalidateCachedPrefix("alerts:");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
