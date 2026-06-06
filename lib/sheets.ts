import { google, sheets_v4 } from "googleapis";
import { getGoogleAuth, getSheetId } from "./google-auth";
import { SHEET_TABS } from "./types";

let sheetsClient: sheets_v4.Sheets | null = null;

async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  if (!sheetsClient) {
    sheetsClient = google.sheets({ version: "v4", auth: getGoogleAuth() });
  }
  return sheetsClient;
}

function headerToKey(header: string): string {
  return header.toString().trim().toLowerCase().replace(/\s+/g, "_");
}

export async function getSheetRows(tabName: string): Promise<Record<string, string | number>[]> {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tabName}'`,
  });

  const data = response.data.values ?? [];
  if (data.length < 2) return [];

  const headers = data[0] as string[];
  const rows: Record<string, string | number>[] = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.every((cell) => cell === "" || cell == null)) continue;

    const obj: Record<string, string | number> = { _sheet_row: i + 1 };
    for (let j = 0; j < headers.length; j++) {
      const key = headerToKey(headers[j]);
      obj[key] = row[j] ?? "";
    }
    rows.push(obj);
  }

  return rows;
}

async function findRowIndex(tabName: string, idColumn: number, id: string): Promise<number | null> {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tabName}'`,
  });

  const data = response.data.values ?? [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idColumn]) === String(id)) {
      return i + 1;
    }
  }
  return null;
}

const TAB_COLUMNS: Record<string, Record<string, number>> = {
  [SHEET_TABS.USER_RATINGS]: {
    rating: 3,
    watch_status: 6,
    comments: 8,
  },
  [SHEET_TABS.RECOMMENDATIONS]: {
    user_action: 15,
    user_rating: 16,
    user_reasons: 17,
    user_comments: 18,
  },
  [SHEET_TABS.EPISODE_ALERTS]: {
    seen: 5,
  },
};

function columnIndexToLetter(colIdx: number): string {
  return String.fromCharCode(64 + colIdx);
}

export async function updateSheetField(
  tabName: string,
  id: string,
  field: string,
  value: string
): Promise<{ status: "success" | "error" }> {
  const columns = TAB_COLUMNS[tabName];
  const colIdx = columns?.[field];
  if (!colIdx) return { status: "error" };

  const rowIndex = await findRowIndex(tabName, 0, id);
  if (rowIndex == null) return { status: "error" };

  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();
  const colLetter = columnIndexToLetter(colIdx);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabName}'!${colLetter}${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: { values: [[value]] },
  });

  return { status: "success" };
}

export async function updateSheetFieldByRow(
  tabName: string,
  rowIndex: number,
  field: string,
  value: string
): Promise<{ status: "success" | "error" }> {
  const columns = TAB_COLUMNS[tabName];
  const colIdx = columns?.[field];
  if (!colIdx) return { status: "error" };

  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();
  const colLetter = columnIndexToLetter(colIdx);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabName}'!${colLetter}${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: { values: [[value]] },
  });

  return { status: "success" };
}
