import { NextResponse } from "next/server";
import { ensureSparkProfileForTitle } from "@/lib/title-profile";
import { triggerSparkProfileRequest } from "@/lib/spark-trigger";
import { invalidateCachedPrefix } from "@/lib/sheet-cache";

/**
 * Request a Spark fit-score profile for a show already in the library.
 * If GEMINI_API_KEY is set, profiles instantly in-app; otherwise queues the
 * request in the sheet for the external Gemini agent to fulfill on its next run.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title = String(body.title ?? "").trim();
    const userRatingId = String(body.user_rating_id ?? "").trim();
    if (!title) {
      return NextResponse.json({ error: "Missing title" }, { status: 400 });
    }

    const hints = {
      title,
      platform: String(body.platform ?? ""),
      release_date: String(body.release_date ?? ""),
      watch_status: String(body.watch_status ?? "watching"),
    };

    if (process.env.GEMINI_API_KEY?.trim()) {
      try {
        const recommendation = await ensureSparkProfileForTitle(hints);
        if (recommendation) {
          invalidateCachedPrefix("recommendations:");
          invalidateCachedPrefix("bootstrap:");
          return NextResponse.json({ ok: true, recommendation, sparkPending: false });
        }
      } catch {
        // Fall through to the sheet trigger for the external agent.
      }
    }

    await triggerSparkProfileRequest({
      title,
      watch_status: hints.watch_status,
      platform: hints.platform,
      release_date: hints.release_date,
      user_rating_id: userRatingId,
    });

    return NextResponse.json({ ok: true, recommendation: null, sparkPending: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not request Spark profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
