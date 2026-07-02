/**
 * Push GOOGLE_REFRESH_TOKEN from .env.local to Vercel production and redeploy.
 * Run: npm run google:deploy
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envPath = join(root, ".env.local");

function loadRefreshToken() {
  if (!existsSync(envPath)) {
    console.error("Missing .env.local");
    process.exit(1);
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("GOOGLE_REFRESH_TOKEN=")) continue;
    const token = trimmed.slice("GOOGLE_REFRESH_TOKEN=".length).trim();
    if (!token) {
      console.error("GOOGLE_REFRESH_TOKEN is empty in .env.local");
      process.exit(1);
    }
    return token;
  }

  console.error("GOOGLE_REFRESH_TOKEN not found in .env.local");
  process.exit(1);
}

function run(command, args, input) {
  const result = spawnSync(command, args, {
    cwd: root,
    input,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const token = loadRefreshToken();

console.log("Updating GOOGLE_REFRESH_TOKEN on Vercel production...");
run("npx", ["vercel", "env", "rm", "GOOGLE_REFRESH_TOKEN", "production", "-y"]);
run("npx", ["vercel", "env", "add", "GOOGLE_REFRESH_TOKEN", "production"], token);

console.log("\nRedeploying production...");
run("npx", ["vercel", "--prod", "--yes"]);

console.log("\nVerifying local Google connection...");
run("npm", ["run", "google:verify"]);

console.log("\nDone. Hard-refresh https://tv-movie-agent.vercel.app");
