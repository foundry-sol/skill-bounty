#!/usr/bin/env bash
# install.sh — One-shot setup for solana-staking-yield-skill
#
# Requirements: Node.js >= 18
#
# Usage:
#   chmod +x install.sh
#   ./install.sh

set -euo pipefail

echo "→ Installing solana-staking-yield-skill..."

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

echo "→ Installing dependencies..."
npm install --omit=dev --silent

echo "→ Running tests..."
npm test --silent

echo ""
echo "✓ solana-staking-yield-skill ready."
echo ""
echo "Try:"
echo "  node scripts/fetch_validators.mjs --limit 5"
echo "  node scripts/simulate_stake.mjs --principal 100 --commission 5 --epochs 30"
echo "  node scripts/lst_yield_comparison.mjs --principal 1000 --days 365"