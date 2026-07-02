import { NextResponse } from "next/server";
import { parseWatchMessage } from "@/lib/gemini";
import { attachRatingImages, mapUserRatings } from "@/lib/mappers";
import { getCached, invalidateCachedPrefix, setCached } from "@/lib/sheet-cache";
import { appendUserRating, deleteUserRating, getSheetRows, updateSheetField, updateUserRating } from "@/lib/sheets";
import { enrichStructuredEntry, type StructuredWatchEntry } from "@/lib/structured-entry";
import { SHEET_TABS } from "@/lib/types";
import { enrichWatchEntry } from "@/lib/watch-entry";
import { triggerSparkProfileRequest } from "@/lib/spark-trigger";
import { ensureSparkProfileForTitle } from "@/lib/title-profile";
import type { Recommendation } from "@/lib/types";

const CACHE_KEY = "watched:all";

async function requestSparkProfile(
  enriched: StructuredWatchEntry,
  userRatingId: string
): Promise<{ recommendation: Recommendation | null; sparkPending: boolean }> {
  const hints = {
    title: enriched.show_title,
    platform: enriched.platform,
    release_date: enriched.release_date,
    type: enriched.type_hint,
    watch_status: enriched.watch_status,
  };

  if (process.env.GEMINI_API_KEY?.trim()) {
    try {
      const recommendation = await ensureSparkProfileForTitle(hints);
      if (recommendation) {
        return { recommendation, sparkPending: false };
      }
    } catch {
      // Fall through to sheet trigger for Workspace Spark.
    }
  }

  await triggerSparkProfileRequest({
    title: enriched.show_title,
    watch_status: enriched.watch_status,
    platform: enriched.platform,
    release_date: enriched.release_date,
    user_rating_id: userRatingId,
  });

  return { recommendation: null, sparkPending: true };
}

function parseStructuredEntry(body: Record<string, unknown>): StructuredWatchEntry | null {
  const raw = body.entry;
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const showTitle = String(entry.show_title ?? "").trim();
  if (!showTitle) return null;

  return {
    show_title: showTitle,
    rating: Number(entry.rating ?? 0),
    release_date: String(entry.release_date ?? ""),
    platform: String(entry.platform ?? ""),
    watch_status: String(entry.watch_status ?? "want_to_watch"),
    why_reasons: String(entry.why_reasons ?? ""),
    comments: String(entry.comments ?? ""),
    media_kind:
      entry.media_kind === "movie" ? "movie" : entry.media_kind === "tv" ? "tv" : undefined,
  };
}

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const structured = parseStructuredEntry(body);
    const existingId = String(body.existingId ?? "").trim();

    if (structured) {
      const enriched = await enrichStructuredEntry(structured);
      let savedId = existingId;

      if (existingId) {
        const result = await updateUserRating(existingId, enriched);
        if (result.status === "error") {
          return NextResponse.json({ error: "Could not update show" }, { status: 404 });
        }
      } else {
        const result = await appendUserRating(enriched);
        if (result.status === "error") {
          return NextResponse.json({ error: "Could not save to sheet" }, { status: 500 });
        }
        savedId = result.id;
      }

      const rows = await getSheetRows(SHEET_TABS.USER_RATINGS);
      const mapped = mapUserRatings(rows).find((row) => row.id === savedId);
      if (!mapped) {
        return NextResponse.json({ error: "Saved but could not reload row" }, { status: 500 });
      }

      const [item] = await attachRatingImages([mapped]);
      invalidateCachedPrefix("watched:");
      invalidateCachedPrefix("bootstrap:");
      invalidateCachedPrefix("recommendations:");

      const { recommendation, sparkPending } = existingId
        ? { recommendation: null, sparkPending: false }
        : await requestSparkProfile(enriched, savedId);

      return NextResponse.json(
        { item, entry: enriched, recommendation, sparkPending },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const message = String(body.message ?? "").trim();
    if (!message) {
      return NextResponse.json({ error: "Tell me what you watched" }, { status: 400 });
    }

    const parsed = await parseWatchMessage(message);
    const enriched = await enrichWatchEntry(parsed);
    const result = await appendUserRating(enriched);
    if (result.status === "error") {
      return NextResponse.json({ error: "Could not save to sheet" }, { status: 500 });
    }

    const rows = await getSheetRows(SHEET_TABS.USER_RATINGS);
    const mapped = mapUserRatings(rows).find((row) => row.id === result.id);
    if (!mapped) {
      return NextResponse.json({ error: "Saved but could not reload row" }, { status: 500 });
    }

    const [item] = await attachRatingImages([mapped]);
    invalidateCachedPrefix("watched:");
    invalidateCachedPrefix("bootstrap:");
    invalidateCachedPrefix("recommendations:");

    const { recommendation, sparkPending } = await requestSparkProfile(
      {
        show_title: enriched.show_title,
        rating: enriched.rating,
        release_date: enriched.release_date,
        platform: enriched.platform,
        watch_status: enriched.watch_status,
        comments: enriched.comments,
        type_hint: enriched.type_hint,
      },
      result.id
    );

    return NextResponse.json(
      { item, parsed: enriched, recommendation, sparkPending },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add show";
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

    const allowed = ["rating", "watch_status", "comments", "why_reasons", "show_title", "release_date", "platform"];
    if (!allowed.includes(field)) {
      return NextResponse.json({ error: "Field not allowed" }, { status: 400 });
    }

    const updates: Partial<{
      rating: number;
      watch_status: string;
      comments: string;
      why_reasons: string;
      show_title: string;
      release_date: string;
      platform: string;
    }> = {
      [field]: field === "rating" ? Number(value) : value,
    };

    const result = await updateUserRating(id, updates);
    if (result.status === "error") {
      return NextResponse.json({ error: "Update failed" }, { status: 404 });
    }

    invalidateCachedPrefix("watched:");
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

    const result = await deleteUserRating(id);
    if (result.status === "error") {
      return NextResponse.json({ error: "Delete failed" }, { status: 404 });
    }

    invalidateCachedPrefix("watched:");
    invalidateCachedPrefix("bootstrap:");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
