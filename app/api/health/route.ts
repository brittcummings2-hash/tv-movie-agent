import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getGoogleAuth, getSheetId } from "@/lib/google-auth";
import { formatGoogleSheetsError } from "@/lib/sheets-error";

export const dynamic = "force-dynamic";

/**
 * Daily health check (hit by Vercel cron and available at /api/health).
 * Confirms the Google token still refreshes and the sheet is readable,
 * so a broken connection surfaces in the cron dashboard instead of
 * being discovered when the app won't load.
 */
export async function GET() {
  try {
    const auth = getGoogleAuth();
    const { token } = await auth.getAccessToken();
    if (!token) throw new Error("Failed to refresh access token");

    const sheets = google.sheets({ version: "v4", auth });
    const meta = await sheets.spreadsheets.get({ spreadsheetId: getSheetId() });

    return NextResponse.json({
      ok: true,
      sheet: meta.data.properties?.title ?? "",
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = formatGoogleSheetsError(error);
    console.error("health check failed:", message);
    return NextResponse.json(
      { ok: false, error: message, checkedAt: new Date().toISOString() },
      { status: 500 }
    );
  }
}
