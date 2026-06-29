#!/usr/bin/env bash
set -euo pipefail
echo "→ Installing governance-watcher-skill..."
if ! command -v node >/dev/null 2>&1; then echo "✗ Node required"; exit 1; fi
NODE_MAJOR=$(node --version | sed -E 's/v([0-9]+)\..*/\1/')
[ "$NODE_MAJOR" -lt 18 ] && { echo "✗ Node 18+ required"; exit 1; }
echo "✓ Node $(node --version) found"
echo "→ Running tests..."
npm test --silent
echo "✓ governance-watcher-skill ready."