#!/usr/bin/env bash
# install.sh — One-shot setup for nft-portfolio-skill

set -euo pipefail

echo "→ Installing nft-portfolio-skill..."

if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js not found. Install Node 18+ first"
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
echo "✓ nft-portfolio-skill ready."