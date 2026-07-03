import { NextResponse, type NextRequest } from "next/server";
import { backupSheetTabs } from "@/lib/backup";
import { formatGoogleSheetsError } from "@/lib/sheets-error";
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

/** Weekly snapshot of the sheet's core tabs (hit by Vercel cron). */
export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await backupSheetTabs();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = formatGoogleSheetsError(error);
    console.error("backup failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
