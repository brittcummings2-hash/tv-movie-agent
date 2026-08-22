import { NextResponse } from "next/server";
import { getCached, invalidateCachedPrefix, setCached } from "@/lib/sheet-cache";
import { deleteRecommendation, getSheetRows, updateSheetField, updateSheetFields } from "@/lib/sheets";
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

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // platform/release_date cover factual corrections (e.g. a pick listed
    // under the wrong streamer).
    const allowed = ["user_action", "user_rating", "user_reasons", "user_comments", "platform", "release_date"];

    // Multi-field form: { id, fields: { user_action, user_reasons, ... } }
    if (body.fields && typeof body.fields === "object") {
      for (const field of Object.keys(body.fields as Record<string, unknown>)) {
        if (!allowed.includes(field)) {
          return NextResponse.json({ error: "Field not allowed" }, { status: 400 });
        }
      }
      // updateSheetField resolves columns from the header row, so it covers
      // fields the fixed column map doesn't know about.
      for (const [field, value] of Object.entries(body.fields as Record<string, unknown>)) {
        const result = await updateSheetField(SHEET_TABS.RECOMMENDATIONS, id, field, String(value ?? ""));
        if (result.status === "error") {
          return NextResponse.json({ error: "Update failed" }, { status: 404 });
        }
      }
      invalidateCachedPrefix("recommendations:");
      invalidateCachedPrefix("bootstrap:");
      return NextResponse.json({ ok: true });
    }

    const field = String(body.field ?? "user_action");
    const value = String(body.val ?? body.value ?? "");

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

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const id = String(body.id ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const result = await deleteRecommendation(id);
    if (result.status === "error") {
      return NextResponse.json({ error: "Delete failed" }, { status: 404 });
    }

    invalidateCachedPrefix("recommendations:");
    invalidateCachedPrefix("bootstrap:");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
