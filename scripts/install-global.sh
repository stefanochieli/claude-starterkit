#!/usr/bin/env bash
# Adds (or removes) the starterkit working rules in your global ~/.claude/CLAUDE.md.
# Plugins cannot ship a CLAUDE.md, so this is a separate, optional step.
# Idempotent: the block between the starterkit markers is replaced, never duplicated,
# and a run that changes nothing makes no backup. Otherwise a backup is made first.
#
# Usage: scripts/install-global.sh [--remove]
set -euo pipefail

REMOVE=0
case "${1:-}" in
  "") ;;
  --remove) REMOVE=1 ;;
  *) echo "Usage: $0 [--remove]" >&2; exit 2 ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/plugins/starterkit/templates/global-claude.md"
DEST_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
DEST="$DEST_DIR/CLAUDE.md"

if [ ! -f "$DEST" ] && [ "$REMOVE" -eq 1 ]; then
  echo "Nothing to remove: $DEST does not exist"
  exit 0
fi

mkdir -p "$DEST_DIR"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

if [ -f "$DEST" ]; then
  # Marker names include the project's earlier names (proofkit, lean-kit).
  STARTS="$(grep -cE '^<!-- (starterkit|proofkit|lean-kit):start -->$' "$DEST" || true)"
  ENDS="$(grep -cE '^<!-- (starterkit|proofkit|lean-kit):end -->$' "$DEST" || true)"
  if [ "$STARTS" -ne "$ENDS" ]; then
    echo "Unbalanced starterkit markers in $DEST ($STARTS start, $ENDS end). Fix it by hand; nothing was changed." >&2
    exit 1
  fi
  # Drop the old block, then trailing blank lines, so re-runs do not accumulate blanks.
  awk '/^<!-- (starterkit|proofkit|lean-kit):start -->$/{skip=1;next} /^<!-- (starterkit|proofkit|lean-kit):end -->$/{skip=0;next} !skip{l[++n]=$0} END{while(n>0&&l[n]=="")n--; for(i=1;i<=n;i++)print l[i]}' "$DEST" > "$TMP"
fi

if [ "$REMOVE" -eq 0 ]; then
  { [ -s "$TMP" ] && echo; cat "$SRC"; } >> "$TMP"
fi

if [ -f "$DEST" ] && cmp -s "$TMP" "$DEST"; then
  echo "Already up to date: $DEST"
  exit 0
fi

if [ -f "$DEST" ]; then
  BACKUP="$DEST.bak-$(date +%Y%m%d%H%M%S)"
  N=1
  while [ -e "$BACKUP" ]; do BACKUP="$DEST.bak-$(date +%Y%m%d%H%M%S)-$N"; N=$((N+1)); done
  cp "$DEST" "$BACKUP"
  echo "Backup: $BACKUP"
fi

cat "$TMP" > "$DEST"
if [ "$REMOVE" -eq 1 ]; then echo "Removed starterkit block from $DEST"; else echo "Updated $DEST"; fi
