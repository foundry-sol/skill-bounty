#!/usr/bin/env bash
# install.sh — One-shot setup for multi-agent-orchestration-skill

set -euo pipefail

echo "→ Installing multi-agent-orchestration-skill..."

if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js not found. Install Node 18+ first: https://nodejs.org"
  exit 1
fi

NODE_MAJOR=$(node --version | sed -E 's/v([0-9]+)\..*/\1/')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "✗ Node 18+ required (you have $(node --version))"
  exit 1
fi

echo "✓ Node $(node --version) found"

echo "→ Running tests..."
npm test --silent

echo ""
echo "✓ multi-agent-orchestration-skill ready."
echo ""
echo "Try:"
echo "  node scripts/index.mjs demo"
echo "  node --test tests/*.test.mjs"