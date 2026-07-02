import { getGoogleAuth, getSheetId } from "./google-auth";
import { google } from "googleapis";
import { SHEET_TABS } from "./types";

export interface SparkProfileRequest {
  title: string;
  watch_status: string;
  platform?: string;
  release_date?: string;
  user_rating_id: string;
}

export interface SparkTriggerResult {
  queueId: string;
  title: string;
  status: "pending";
}

/** Row 1 = key | value headers; data starts row 2. B2 = run_agent_trigger (Spark conditional). */
const SETTINGS_DATA_START_ROW = 2;
const SETTINGS_DATA_END_ROW = 6;

async function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getGoogleAuth() });
}

async function listTabNames(): Promise<Set<string>> {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  return new Set(
    meta.data.sheets?.map((sheet) => sheet.properties?.title ?? "").filter(Boolean) ?? []
  );
}

async function addTabIfMissing(title: string, headers: string[][]): Promise<void> {
  const tabs = await listTabNames();
  if (tabs.has(title)) return;

  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title } } }],
    },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${title}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values: headers },
  });
}

export async function ensureSparkTriggerTabs(): Promise<void> {
  await addTabIfMissing(SHEET_TABS.SETTINGS, [
    ["key", "value"],
    ["run_agent_trigger", "FALSE"],
    ["profile_title", ""],
    ["profile_user_rating_id", ""],
    ["trigger_reason", ""],
    ["last_triggered_at", ""],
  ]);

  await addTabIfMissing(SHEET_TABS.SPARK_QUEUE, [
    [
      "id",
      "title",
      "watch_status",
      "platform",
      "release_date",
      "user_rating_id",
      "status",
      "created_at",
      "completed_at",
    ],
  ]);
}

async function findNextSparkQueueRowIndex(): Promise<number> {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${SHEET_TABS.SPARK_QUEUE}'!A2:I`,
  });

  const values = response.data.values ?? [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i] ?? [];
    const hasData = row.some((cell) => String(cell ?? "").trim() !== "");
    if (!hasData) return i + 2;
  }

  return values.length + 2;
}

/** Queue a title for Workspace Spark and flip settings!B2 (run_agent_trigger). */
export async function triggerSparkProfileRequest(
  request: SparkProfileRequest
): Promise<SparkTriggerResult> {
  await ensureSparkTriggerTabs();

  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();
  const queueId = `SQ${Date.now()}`;
  const now = new Date().toISOString();
  const rowIndex = await findNextSparkQueueRowIndex();

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${SHEET_TABS.SPARK_QUEUE}'!A${rowIndex}:I${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          queueId,
          request.title,
          request.watch_status,
          request.platform ?? "",
          request.release_date ?? "",
          request.user_rating_id,
          "pending",
          now,
          "",
        ],
      ],
    },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${SHEET_TABS.SETTINGS}'!A${SETTINGS_DATA_START_ROW}:B${SETTINGS_DATA_END_ROW}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        ["run_agent_trigger", "TRUE"],
        ["profile_title", request.title],
        ["profile_user_rating_id", request.user_rating_id],
        ["trigger_reason", "manual_add"],
        ["last_triggered_at", now],
      ],
    },
  });

  return { queueId, title: request.title, status: "pending" };
}

/** Ask the external Spark agent to run (refresh recommendations) on its next check. */
export async function triggerAgentRefresh(): Promise<void> {
  await ensureSparkTriggerTabs();

  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();
  const now = new Date().toISOString();

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${SHEET_TABS.SETTINGS}'!A${SETTINGS_DATA_START_ROW}:B${SETTINGS_DATA_END_ROW}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        ["run_agent_trigger", "TRUE"],
        ["profile_title", ""],
        ["profile_user_rating_id", ""],
        ["trigger_reason", "manual_refresh"],
        ["last_triggered_at", now],
      ],
    },
  });
}
