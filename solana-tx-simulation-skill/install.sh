#!/bin/bash
set -euo pipefail

KIT_PATH="${SOLANA_AI_KIT_PATH:-$HOME/solana-ai-kit}"
SKILL_NAME="solana-tx-simulation-skill"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$KIT_PATH/skills/$SKILL_NAME"

echo "Installing $SKILL_NAME into $TARGET_DIR ..."
mkdir -p "$KIT_PATH/skills"

if [[ -d "$TARGET_DIR" ]]; then
  mv "$TARGET_DIR" "${TARGET_DIR}.bak.$(date +%s)"
fi
cp -r "$SOURCE_DIR" "$TARGET_DIR"
rm -f "$TARGET_DIR/install.sh"
chmod +x "$TARGET_DIR"/scripts/*.mjs

if command -v npm >/dev/null 2>&1; then
  if [[ "${1:-}" != "--no-deps" ]]; then
    (cd "$TARGET_DIR" && npm install --omit=dev --silent)
  fi
fi

echo ""
echo "✓ Installed $SKILL_NAME to $TARGET_DIR"
echo ""
echo "Try it:"
echo "  cd $TARGET_DIR"
echo "  npm test"
echo ""
echo "Uninstall: rm -rf $TARGET_DIR"