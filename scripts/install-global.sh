#!/usr/bin/env bash
# Adds (or removes) the starterkit working rules in your global ~/.claude/CLAUDE.md.
# Plugins cannot ship a CLAUDE.md, so this is a separate, optional step.
# Idempotent: the block between the starterkit markers is replaced, never duplicated.
# A timestamped backup is made before every change.
#
# Usage: scripts/install-global.sh [--remove]
set -euo pipefail

REMOVE=0
[ "${1:-}" = "--remove" ] && REMOVE=1

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/plugins/starterkit/templates/global-claude.md"
DEST_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
DEST="$DEST_DIR/CLAUDE.md"

mkdir -p "$DEST_DIR"

if [ -f "$DEST" ]; then
  BACKUP="$DEST.bak-$(date +%Y%m%d%H%M%S)"
  cp "$DEST" "$BACKUP"
  echo "Backup: $BACKUP"
  TMP="$(mktemp)"
  # Also drops blocks written under the project's earlier names (proofkit, lean-kit).
  awk '/^<!-- (starterkit|proofkit|lean-kit):start -->$/{skip=1;next} /^<!-- (starterkit|proofkit|lean-kit):end -->$/{skip=0;next} !skip' "$DEST" > "$TMP"
  mv "$TMP" "$DEST"
fi

if [ "$REMOVE" -eq 1 ]; then
  echo "Removed starterkit block from $DEST"
  exit 0
fi

touch "$DEST"
{ [ -s "$DEST" ] && echo; cat "$SRC"; } >> "$DEST"
echo "Updated $DEST"
