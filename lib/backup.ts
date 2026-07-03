import { google, sheets_v4 } from "googleapis";
import { getGoogleAuth, getSheetId } from "./google-auth";
import { SHEET_TABS } from "./types";

const BACKUP_PREFIX = "backup_";
const TABS_TO_BACK_UP = [
  SHEET_TABS.USER_RATINGS,
  SHEET_TABS.RECOMMENDATIONS,
  SHEET_TABS.EPISODE_ALERTS,
];

/**
 * Snapshot the core tabs into backup_<tab> tabs inside the same spreadsheet.
 * Overwrites the previous snapshot — one-deep insurance against an
 * accidental mass-edit or delete, not a full version history.
 */
export async function backupSheetTabs(): Promise<{ tabs: string[]; backedUpAt: string }> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = getSheetId();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existingTitles = new Set(
    (meta.data.sheets ?? []).map((sheet) => sheet.properties?.title ?? "")
  );

  const addRequests: sheets_v4.Schema$Request[] = [];
  for (const tab of TABS_TO_BACK_UP) {
    const backupTitle = `${BACKUP_PREFIX}${tab}`;
    if (!existingTitles.has(backupTitle)) {
      addRequests.push({ addSheet: { properties: { title: backupTitle, hidden: true } } });
    }
  }
  if (addRequests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: addRequests },
    });
  }

  const backedUpAt = new Date().toISOString();
  const backedUp: string[] = [];

  for (const tab of TABS_TO_BACK_UP) {
    if (!existingTitles.has(tab)) continue;
    const backupTitle = `${BACKUP_PREFIX}${tab}`;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tab}'`,
    });
    const values = response.data.values ?? [];

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${backupTitle}'`,
    });
    if (values.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${backupTitle}'!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [[`# snapshot ${backedUpAt}`], ...values] },
      });
    }
    backedUp.push(tab);
  }

  return { tabs: backedUp, backedUpAt };
}
