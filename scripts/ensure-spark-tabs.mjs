/**
 * Bootstrap Spark sheet trigger tabs (Spark layout: settings row 1 = headers).
 * Run: node scripts/ensure-spark-tabs.mjs
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envPath = join(root, ".env.local");

function loadEnvFile() {
  if (!existsSync(envPath)) {
    console.error(`Missing env file: ${envPath}`);
    process.exit(1);
  }
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile();

const oauth2 = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);
oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const sheetId = process.env.GOOGLE_SHEET_ID;

async function upsertSettingsTab(sheets) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: "'settings'!A1:B6",
    valueInputOption: "RAW",
    requestBody: {
      values: [
        ["key", "value"],
        ["run_agent_trigger", "FALSE"],
        ["profile_title", ""],
        ["profile_user_rating_id", ""],
        ["trigger_reason", ""],
        ["last_triggered_at", ""],
      ],
    },
  });
  console.log("Updated settings tab (B2 = run_agent_trigger)");
}

async function addTabIfMissing(sheets, title, headers) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const tabs = new Set(meta.data.sheets?.map((s) => s.properties?.title ?? "") ?? []);
  if (tabs.has(title)) {
    console.log(`Tab already exists: ${title}`);
    return;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `'${title}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values: headers },
  });

  console.log(`Created tab: ${title}`);
}

async function main() {
  const sheets = google.sheets({ version: "v4", auth: oauth2 });

  await addTabIfMissing(sheets, "settings", [
    ["key", "value"],
    ["run_agent_trigger", "FALSE"],
    ["profile_title", ""],
    ["profile_user_rating_id", ""],
    ["trigger_reason", ""],
    ["last_triggered_at", ""],
  ]);

  await upsertSettingsTab(sheets);

  await addTabIfMissing(sheets, "spark_queue", [
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

  console.log("Spark trigger tabs ready.");
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
