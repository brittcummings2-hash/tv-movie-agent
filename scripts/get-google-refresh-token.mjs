/**
 * One-time setup: get a Google OAuth refresh token for your account.
 * Run: npm run google:auth
 */
import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { google } from "googleapis";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envPath = join(root, ".env.local");

function loadEnvFile() {
  if (!existsSync(envPath)) return;
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

function saveRefreshToken(refreshToken) {
  if (!refreshToken) {
    console.error("Google did not return a refresh token. Try again with prompt=consent.");
    return;
  }

  let content = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  if (/^GOOGLE_REFRESH_TOKEN=/m.test(content)) {
    content = content.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, `GOOGLE_REFRESH_TOKEN=${refreshToken}`);
  } else {
    content = `${content.trim()}\nGOOGLE_REFRESH_TOKEN=${refreshToken}\n`;
  }
  writeFileSync(envPath, content);
  console.log("\nSaved GOOGLE_REFRESH_TOKEN to .env.local");

  console.log("\nPushing token to Vercel and redeploying...");
  const push = spawnSync("node", ["scripts/google-push-token.mjs"], {
    cwd: root,
    stdio: "inherit",
  });
  if (push.status !== 0) {
    console.log("\nVercel deploy failed. Run manually: npm run google:deploy");
  }
}

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = "http://localhost:3333/oauth2callback";
const scopes = ["https://www.googleapis.com/auth/spreadsheets"];

if (!clientId || !clientSecret) {
  console.error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env.local");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const authUrl = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: scopes,
});

console.log("\n1. Open this URL in your browser:\n");
console.log(authUrl);
console.log("\n2. Approve access. You will be redirected to localhost.\n");

const server = createServer(async (req, res) => {
  if (!req.url?.startsWith("/oauth2callback")) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const url = new URL(req.url, "http://localhost:3333");
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(`<h1>Auth failed</h1><p>${error ?? "No code returned"}</p>`);
    server.close();
    process.exit(1);
  }

  try {
    const { tokens } = await oauth2.getToken(code);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h1>Success</h1><p>Return to the terminal — updating Vercel now.</p>");

    console.log(`\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    saveRefreshToken(tokens.refresh_token);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end(`<h1>Token exchange failed</h1><p>${String(err)}</p>`);
    console.error(err);
    process.exit(1);
  } finally {
    server.close();
  }
});

server.listen(3333, () => {
  console.log("Waiting for redirect on http://localhost:3333 ...\n");
});

server.on("error", (err) => {
  if (err && "code" in err && err.code === "EADDRINUSE") {
    console.error("\nPort 3333 is already in use.");
    console.error("Either open the auth URL above in your browser (if a server is already running),");
    console.error("or free the port: lsof -ti :3333 | xargs kill -9\n");
    process.exit(1);
  }
  throw err;
});
