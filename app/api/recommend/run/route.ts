import { NextResponse, type NextRequest } from "next/server";
import { invalidateCachedPrefix } from "@/lib/sheet-cache";
import { runRecommendationRefresh, type RecommendationAudience } from "@/lib/recommend";
import {
  isPortalAuthEnabled,
  isValidSessionToken,
  PORTAL_SESSION_COOKIE,
} from "@/lib/portal-auth";

export const dynamic = "force-dynamic";
// The engine run (Claude + web searches, sometimes a second retry pass)
// can exceed 300s — the 2026-08-17 cron timed out exactly there. 800 is the
// Pro-plan Fluid compute ceiling.
export const maxDuration = 800;

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return true;
  }
  if (!isPortalAuthEnabled()) return true;
  const session = request.cookies.get(PORTAL_SESSION_COOKIE)?.value;
  return isValidSessionToken(session);
}

async function run(request: NextRequest, audience: RecommendationAudience) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runRecommendationRefresh(audience);
    invalidateCachedPrefix("recommendations:");
    invalidateCachedPrefix("bootstrap:");
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Recommendation refresh failed";
    console.error("recommend-run failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Vercel cron entry point — both lanes: solo picks, then a couple for her + Blake. */
export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Sequential on purpose: the joint run re-reads the sheet, so it excludes
  // whatever the solo run just added and can't duplicate it.
  const outcome: {
    solo?: { added: number; ids: string[] };
    both?: { added: number; ids: string[] };
    soloError?: string;
    bothError?: string;
  } = {};

  try {
    outcome.solo = await runRecommendationRefresh("me");
  } catch (error) {
    outcome.soloError = error instanceof Error ? error.message : "Solo run failed";
    console.error("recommend-run solo lane failed:", outcome.soloError);
  }

  try {
    outcome.both = await runRecommendationRefresh("both", { maxPicks: 2 });
  } catch (error) {
    outcome.bothError = error instanceof Error ? error.message : "Joint run failed";
    console.error("recommend-run joint lane failed:", outcome.bothError);
  }

  invalidateCachedPrefix("recommendations:");
  invalidateCachedPrefix("bootstrap:");

  const added = (outcome.solo?.added ?? 0) + (outcome.both?.added ?? 0);
  if (outcome.soloError && outcome.bothError) {
    return NextResponse.json(
      { ok: false, error: `${outcome.soloError}; ${outcome.bothError}` },
      { status: 500 }
    );
  }
  return NextResponse.json(
    { ok: true, added, ...outcome },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** In-app "Fresh picks" button — audience comes from the chooser. */
export async function POST(request: NextRequest) {
  let audience: RecommendationAudience = "me";
  try {
    const body = await request.json();
    if (body?.audience === "both") audience = "both";
  } catch {
    // No body — solo by default.
  }
  return run(request, audience);
}
