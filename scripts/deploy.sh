#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Building..."
npm run build

echo "Deploying to Vercel (production)..."
npx vercel deploy --prod --yes --scope brittany-cummings-projects

echo "Done. Production: https://tv-movie-agent.vercel.app"
