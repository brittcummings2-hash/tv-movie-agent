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

const RETRYABLE_STATUS = new Set([429, 500, 502, 503]);

function isRetryable(error: unknown): boolean {
  const err = error as { code?: number | string; response?: { status?: number } };
  const status = Number(err?.response?.status ?? err?.code);
  return RETRYABLE_STATUS.has(status);
}

/** Sheets occasionally rate-limits or hiccups; retry those instead of failing the request. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  const delays = [500, 1500];
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= delays.length || !isRetryable(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}

function headerToKey(header: string): string {
  return header.toString().trim().toLowerCase().replace(/\s+/g, "_");
}

function getSheetRange(tabName: string): string {
  if (tabName === SHEET_TABS.USER_RATINGS) {
    return `'${tabName}'!A:J`;
  }
  if (tabName === SHEET_TABS.RECOMMENDATIONS) {
    return `'${tabName}'!A:T`;
  }
  return `'${tabName}'`;
}

export async function getSheetRows(tabName: string): Promise<Record<string, string | number>[]> {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();

  const response = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: getSheetRange(tabName),
    })
  );

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

  const response = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tabName}'`,
    })
  );

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
    show_title: 2,
    rating: 3,
    release_date: 4,
    platform: 5,
    watch_status: 6,
    why_reasons: 7,
    comments: 8,
  },
  [SHEET_TABS.RECOMMENDATIONS]: {
    user_action: 16,
    user_rating: 17,
    user_reasons: 18,
    user_comments: 19,
  },
  [SHEET_TABS.EPISODE_ALERTS]: {
    her_rating: 5,
    seen: 6,
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

  await withRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabName}'!${colLetter}${rowIndex}`,
      valueInputOption: "RAW",
      requestBody: { values: [[value]] },
    })
  );

  return { status: "success" };
}

export async function updateSheetFields(
  tabName: string,
  id: string,
  fields: Record<string, string>
): Promise<{ status: "success" | "error" }> {
  const columns = TAB_COLUMNS[tabName];
  if (!columns) return { status: "error" };

  const entries = Object.entries(fields).filter(([field]) => columns[field]);
  if (entries.length === 0) return { status: "error" };

  const rowIndex = await findRowIndex(tabName, 0, id);
  if (rowIndex == null) return { status: "error" };

  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();
  const data: sheets_v4.Schema$ValueRange[] = entries.map(([field, value]) => ({
    range: `'${tabName}'!${columnIndexToLetter(columns[field])}${rowIndex}`,
    values: [[value]],
  }));

  await withRetry(() =>
    sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "RAW", data },
    })
  );

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

  await withRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabName}'!${colLetter}${rowIndex}`,
      valueInputOption: "RAW",
      requestBody: { values: [[value]] },
    })
  );

  return { status: "success" };
}

async function findNextUserRatingRowIndex(): Promise<number> {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();

  const response = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${SHEET_TABS.USER_RATINGS}'!A2:J`,
    })
  );

  const values = response.data.values ?? [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i] ?? [];
    const hasData = row.some((cell) => String(cell ?? "").trim() !== "");
    if (!hasData) return i + 2;
  }

  return values.length + 2;
}

export async function appendUserRating(entry: {
  show_title: string;
  rating: number;
  release_date: string;
  platform: string;
  watch_status: string;
  why_reasons?: string;
  comments: string;
}): Promise<{ status: "success"; id: string } | { status: "error" }> {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();
  const id = `UR${Date.now()}`;
  const today = new Date().toISOString().slice(0, 10);
  const rowIndex = await findNextUserRatingRowIndex();

  await withRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${SHEET_TABS.USER_RATINGS}'!A${rowIndex}:J${rowIndex}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [
          [
            id,
            entry.show_title,
            String(entry.rating),
            entry.release_date,
            entry.platform,
            entry.watch_status,
            entry.why_reasons ?? "",
            entry.comments,
            today,
            today,
          ],
        ],
      },
    })
  );

  return { status: "success", id };
}

export async function updateUserRating(
  id: string,
  fields: Partial<{
    show_title: string;
    rating: number;
    release_date: string;
    platform: string;
    watch_status: string;
    why_reasons: string;
    comments: string;
  }>
): Promise<{ status: "success" | "error" }> {
  const rowIndex = await findRowIndex(SHEET_TABS.USER_RATINGS, 0, id);
  if (rowIndex == null) return { status: "error" };

  const columns = TAB_COLUMNS[SHEET_TABS.USER_RATINGS];
  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();
  const today = new Date().toISOString().slice(0, 10);

  const data: sheets_v4.Schema$ValueRange[] = [];
  for (const [field, value] of Object.entries(fields)) {
    const colIdx = columns[field];
    if (!colIdx || value == null) continue;
    const colLetter = columnIndexToLetter(colIdx);
    data.push({
      range: `'${SHEET_TABS.USER_RATINGS}'!${colLetter}${rowIndex}`,
      values: [[String(value)]],
    });
  }
  data.push({
    range: `'${SHEET_TABS.USER_RATINGS}'!J${rowIndex}`,
    values: [[today]],
  });

  await withRetry(() =>
    sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "RAW", data },
    })
  );

  return { status: "success" };
}

export async function deleteUserRating(id: string): Promise<{ status: "success" | "error" }> {
  const rowIndex = await findRowIndex(SHEET_TABS.USER_RATINGS, 0, id);
  if (rowIndex == null) return { status: "error" };

  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();

  await withRetry(() =>
    sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${SHEET_TABS.USER_RATINGS}'!A${rowIndex}:J${rowIndex}`,
    })
  );

  return { status: "success" };
}

export interface RecommendationSheetEntry {
  title: string;
  release_date: string;
  platform: string;
  type: string;
  fit_score: number;
  available_now: boolean;
  why_she_will_love_it: string;
  the_hook: string;
  comp_shows: string[];
  caution: string;
  buzz_source: string;
  why_options_positive: string;
  why_options_negative: string;
}

async function findNextRecommendationRowIndex(): Promise<number> {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();

  const response = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${SHEET_TABS.RECOMMENDATIONS}'!A2:T`,
    })
  );

  const values = response.data.values ?? [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i] ?? [];
    const hasData = row.some((cell) => String(cell ?? "").trim() !== "");
    if (!hasData) return i + 2;
  }

  return values.length + 2;
}

function nextRecommendationId(existingIds: string[]): string {
  const nums = existingIds
    .map((id) => Number.parseInt(String(id).replace(/^R/i, ""), 10))
    .filter((value) => Number.isFinite(value));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `R${String(next).padStart(3, "0")}`;
}

export async function appendRecommendations(
  entries: RecommendationSheetEntry[],
  options?: { userAction?: string }
): Promise<{ ids: string[] }> {
  if (entries.length === 0) return { ids: [] };

  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();
  const existingRows = await getSheetRows(SHEET_TABS.RECOMMENDATIONS);
  const existingIds = existingRows.map((row) => String(row.id ?? ""));
  const today = new Date().toISOString().slice(0, 10);
  const rowIndex = await findNextRecommendationRowIndex();
  const ids: string[] = [];
  const values: string[][] = [];

  for (const entry of entries) {
    const id = nextRecommendationId([...existingIds, ...ids]);
    ids.push(id);
    values.push([
      id,
      today,
      entry.title,
      entry.release_date,
      entry.platform,
      entry.type,
      String(entry.fit_score),
      entry.available_now ? "TRUE" : "FALSE",
      entry.why_she_will_love_it,
      entry.the_hook,
      JSON.stringify(entry.comp_shows),
      entry.caution,
      entry.buzz_source,
      entry.why_options_positive,
      entry.why_options_negative,
      options?.userAction ?? "",
      "",
      "",
      "",
      today,
    ]);
  }

  await withRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${SHEET_TABS.RECOMMENDATIONS}'!A${rowIndex}:T${rowIndex + values.length - 1}`,
      valueInputOption: "RAW",
      requestBody: { values },
    })
  );

  return { ids };
}
