import { NextResponse } from "next/server";
import { parseWatchMessage } from "@/lib/parse-entry";
import { attachRatingImages, mapUserRatings } from "@/lib/mappers";
import { getCached, invalidateCachedPrefix, setCached } from "@/lib/sheet-cache";
import { appendUserRating, deleteUserRating, getSheetRows, updateUserRating } from "@/lib/sheets";
import { enrichStructuredEntry, type StructuredWatchEntry } from "@/lib/structured-entry";
import { SHEET_TABS } from "@/lib/types";
import { enrichWatchEntry } from "@/lib/watch-entry";
import { ensureProfileForTitle } from "@/lib/recommend";
import type { Recommendation } from "@/lib/types";

export const maxDuration = 60;

const CACHE_KEY = "watched:all";

/** Best-effort synchronous profile — adding the show must succeed even if this fails. */
async function requestProfile(
  enriched: StructuredWatchEntry
): Promise<{ recommendation: Recommendation | null }> {
  try {
    const recommendation = await ensureProfileForTitle({
      title: enriched.show_title,
      platform: enriched.platform,
      release_date: enriched.release_date,
      type: enriched.type_hint,
      watch_status: enriched.watch_status,
    });
    return { recommendation };
  } catch {
    return { recommendation: null };
  }
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

      const { recommendation } = existingId
        ? { recommendation: null }
        : await requestProfile(enriched);

      return NextResponse.json(
        { item, entry: enriched, recommendation },
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

    const { recommendation } = await requestProfile({
      show_title: enriched.show_title,
      rating: enriched.rating,
      release_date: enriched.release_date,
      platform: enriched.platform,
      watch_status: enriched.watch_status,
      comments: enriched.comments,
      type_hint: enriched.type_hint,
    });

    return NextResponse.json(
      { item, parsed: enriched, recommendation },
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

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const allowed = [
      "rating",
      "watch_status",
      "comments",
      "why_reasons",
      "show_title",
      "release_date",
      "platform",
      "current_season",
      "current_episode",
    ];
    const numericFields = new Set(["rating", "current_season", "current_episode"]);

    // Multi-field form: { id, fields: { current_season, current_episode, ... } }
    const rawFields: Record<string, unknown> =
      body.fields && typeof body.fields === "object"
        ? (body.fields as Record<string, unknown>)
        : body.field
          ? { [String(body.field)]: body.val ?? body.value ?? "" }
          : {};

    if (Object.keys(rawFields).length === 0) {
      return NextResponse.json({ error: "Missing field" }, { status: 400 });
    }

    const updates: Record<string, string | number> = {};
    for (const [field, value] of Object.entries(rawFields)) {
      if (!allowed.includes(field)) {
        return NextResponse.json({ error: "Field not allowed" }, { status: 400 });
      }
      updates[field] = numericFields.has(field) ? Number(value) : String(value ?? "");
    }

    const result = await updateUserRating(id, updates as Parameters<typeof updateUserRating>[1]);
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
