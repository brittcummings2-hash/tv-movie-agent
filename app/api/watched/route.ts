import { NextResponse } from "next/server";
import { getCached, invalidateCachedPrefix, setCached } from "@/lib/sheet-cache";
import { getSheetRows, updateSheetField } from "@/lib/sheets";
import { attachRatingImages, mapUserRatings } from "@/lib/mappers";
import { SHEET_TABS } from "@/lib/types";

const CACHE_KEY = "watched:all";

export async function GET() {
  try {
    const cached = getCached<Awaited<ReturnType<typeof attachRatingImages>>>(CACHE_KEY);
    if (cached) {
      return NextResponse.json({ items: cached }, { headers: { "Cache-Control": "no-store" } });
    }

    const rows = await getSheetRows(SHEET_TABS.USER_RATINGS);
    const items = await attachRatingImages(mapUserRatings(rows));
    setCached(CACHE_KEY, items);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load watched list";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = String(body.id ?? "");
    const field = String(body.field ?? "");
    const value = String(body.val ?? body.value ?? "");

    if (!id || !field) {
      return NextResponse.json({ error: "Missing id or field" }, { status: 400 });
    }

    const allowed = ["rating", "watch_status", "comments"];
    if (!allowed.includes(field)) {
      return NextResponse.json({ error: "Field not allowed" }, { status: 400 });
    }

    const result = await updateSheetField(SHEET_TABS.USER_RATINGS, id, field, value);
    if (result.status === "error") {
      return NextResponse.json({ error: "Update failed" }, { status: 404 });
    }

    invalidateCachedPrefix("watched:");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
