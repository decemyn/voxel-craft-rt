#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Please install Node 18+." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund --silent
fi

PORT=${PORT:-5173}
NODE_OPTIONS="--no-warnings" npm run start --silent


