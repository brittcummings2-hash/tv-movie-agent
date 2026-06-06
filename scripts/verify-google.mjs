/**
 * Verify Google OAuth and Sheets connectivity.
 * Run: npm run google:verify
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

const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();
const sheetId = process.env.GOOGLE_SHEET_ID?.trim();

const missing = [];
if (!clientId) missing.push("GOOGLE_CLIENT_ID");
if (!clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
if (!refreshToken) missing.push("GOOGLE_REFRESH_TOKEN");
if (!sheetId) missing.push("GOOGLE_SHEET_ID");

if (missing.length) {
  console.error("Missing env vars:", missing.join(", "));
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
oauth2.setCredentials({ refresh_token: refreshToken });

async function main() {
  console.log("Checking OAuth token refresh...");
  const { token } = await oauth2.getAccessToken();
  if (!token) throw new Error("Failed to refresh access token");
  console.log("OK: access token refreshed");

  console.log("Checking Google Sheets...");
  const sheets = google.sheets({ version: "v4", auth: oauth2 });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const tabNames = meta.data.sheets?.map((s) => s.properties?.title).filter(Boolean) ?? [];
  console.log(`OK: sheet "${meta.data.properties?.title}" (${tabNames.length} tabs)`);
  console.log("Tabs:", tabNames.join(", "));
  console.log("\nAll Google connections verified.");
}

main().catch((err) => {
  const message = err?.response?.data?.error?.message || err?.message || String(err);
  console.error("\nGoogle verification failed:", message);
  process.exit(1);
});
