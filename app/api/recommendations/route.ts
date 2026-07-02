import { NextResponse } from "next/server";
import { getCached, invalidateCachedPrefix, setCached } from "@/lib/sheet-cache";
import { getSheetRows, updateSheetField } from "@/lib/sheets";
import { attachRecommendationImages, mapRecommendations } from "@/lib/mappers";
import { SHEET_TABS } from "@/lib/types";

const CACHE_KEY = "recommendations:all";

export async function GET() {
  try {
    const cached = getCached<Awaited<ReturnType<typeof attachRecommendationImages>>>(CACHE_KEY);
    if (cached) {
      return NextResponse.json({ items: cached }, { headers: { "Cache-Control": "no-store" } });
    }

    const rows = await getSheetRows(SHEET_TABS.RECOMMENDATIONS);
    const mapped = mapRecommendations(rows).sort((a, b) => b.fit_score - a.fit_score);
    const items = await attachRecommendationImages(mapped);
    setCached(CACHE_KEY, items);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load recommendations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = String(body.id ?? "");
    const field = String(body.field ?? "user_action");
    const value = String(body.val ?? body.value ?? "");

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const allowed = ["user_action", "user_rating", "user_comments"];
    if (!allowed.includes(field)) {
      return NextResponse.json({ error: "Field not allowed" }, { status: 400 });
    }

    const result = await updateSheetField(SHEET_TABS.RECOMMENDATIONS, id, field, value);
    if (result.status === "error") {
      return NextResponse.json({ error: "Update failed" }, { status: 404 });
    }

    invalidateCachedPrefix("recommendations:");
    invalidateCachedPrefix("bootstrap:");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
