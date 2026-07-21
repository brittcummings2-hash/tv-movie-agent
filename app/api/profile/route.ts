import { NextResponse } from "next/server";
import { ensureProfileForTitle } from "@/lib/recommend";
import { isClaudeConfigured } from "@/lib/claude";
import { invalidateCachedPrefix } from "@/lib/sheet-cache";

export const maxDuration = 60;

/** Generate a fit-score profile for a show already in the library. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title = String(body.title ?? "").trim();
    if (!title) {
      return NextResponse.json({ error: "Missing title" }, { status: 400 });
    }
    if (!isClaudeConfigured()) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured on the server" },
        { status: 503 }
      );
    }

    const recommendation = await ensureProfileForTitle({
      title,
      platform: String(body.platform ?? ""),
      release_date: String(body.release_date ?? ""),
      watch_status: String(body.watch_status ?? "watching"),
    });

    if (!recommendation) {
      return NextResponse.json({ error: "Could not profile this title" }, { status: 500 });
    }

    invalidateCachedPrefix("recommendations:");
    invalidateCachedPrefix("bootstrap:");
    return NextResponse.json({ ok: true, recommendation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not profile this title";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
