#!/bin/bash
# Installer for position-manager-skill
# Drops the skill into a Solana AI Kit installation.

set -euo pipefail

# Default install location — overridable via SOLANA_AI_KIT_PATH
KIT_PATH="${SOLANA_AI_KIT_PATH:-$HOME/solana-ai-kit}"
SKILL_NAME="position-manager-skill"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$KIT_PATH/skills/$SKILL_NAME"

echo "Installing $SKILL_NAME into $TARGET_DIR ..."

mkdir -p "$KIT_PATH/skills"

# Copy skill contents (preserving structure)
if [[ -d "$TARGET_DIR" ]]; then
  echo "  Found existing install at $TARGET_DIR — backing up to ${TARGET_DIR}.bak"
  mv "$TARGET_DIR" "${TARGET_DIR}.bak.$(date +%s)"
fi
cp -r "$SOURCE_DIR" "$TARGET_DIR"

# Remove the installer itself from the installed copy
rm -f "$TARGET_DIR/install.sh"

# Make scripts executable
chmod +x "$TARGET_DIR"/scripts/*.mjs

# Optional: install npm deps
if command -v npm >/dev/null 2>&1; then
  echo "  Installing npm dependencies (use --no-deps to skip)..."
  if [[ "${1:-}" != "--no-deps" ]]; then
    (cd "$TARGET_DIR" && npm install --omit=dev --silent)
  fi
fi

echo ""
echo "✓ Installed $SKILL_NAME to $TARGET_DIR"
echo ""
echo "Next steps:"
echo "  1. cd $TARGET_DIR"
echo "  2. node scripts/fetch_positions.mjs --mock   # try it with mock data"
echo "  3. node scripts/calculate_il.mjs --position examples/orca_position.json"
echo "  4. npm test"
echo ""
echo "To uninstall: rm -rf $TARGET_DIR"