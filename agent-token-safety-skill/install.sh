#!/bin/bash
# Installer for agent-token-safety-skill
set -euo pipefail

KIT_PATH="${SOLANA_AI_KIT_PATH:-$HOME/solana-ai-kit}"
SKILL_NAME="agent-token-safety-skill"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$KIT_PATH/skills/$SKILL_NAME"

echo "Installing $SKILL_NAME into $TARGET_DIR ..."
mkdir -p "$KIT_PATH/skills"

if [[ -d "$TARGET_DIR" ]]; then
  echo "  Backing up existing install to ${TARGET_DIR}.bak.$(date +%s)"
  mv "$TARGET_DIR" "${TARGET_DIR}.bak.$(date +%s)"
fi

cp -r "$SOURCE_DIR" "$TARGET_DIR"
rm -f "$TARGET_DIR/install.sh"
chmod +x "$TARGET_DIR"/scripts/*.mjs

if command -v npm >/dev/null 2>&1; then
  if [[ "${1:-}" != "--no-deps" ]]; then
    echo "  Installing npm deps..."
    (cd "$TARGET_DIR" && npm install --omit=dev --silent)
  fi
fi

echo ""
echo "✓ Installed $SKILL_NAME to $TARGET_DIR"
echo ""
echo "Try it:"
echo "  cd $TARGET_DIR"
echo "  node scripts/assess_safety.mjs --json examples/rug_pull.json"
echo "  npm test"
echo ""
echo "Uninstall: rm -rf $TARGET_DIR"