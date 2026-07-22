import { NextResponse, type NextRequest } from "next/server";
import { invalidateCachedPrefix } from "@/lib/sheet-cache";
import { runRecommendationRefresh } from "@/lib/recommend";
import {
  isPortalAuthEnabled,
  isValidSessionToken,
  PORTAL_SESSION_COOKIE,
} from "@/lib/portal-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return true;
  }
  if (!isPortalAuthEnabled()) return true;
  const session = request.cookies.get(PORTAL_SESSION_COOKIE)?.value;
  return isValidSessionToken(session);
}

async function run(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runRecommendationRefresh();
    invalidateCachedPrefix("recommendations:");
    invalidateCachedPrefix("bootstrap:");
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Recommendation refresh failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Vercel cron entry point. */
export async function GET(request: NextRequest) {
  return run(request);
}

/** In-app "Fresh picks" button. */
export async function POST(request: NextRequest) {
  return run(request);
}
