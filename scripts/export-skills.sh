#!/usr/bin/env bash
# Exports the starterkit skills for use OUTSIDE Claude Code:
#   - one zip per skill, to upload to claude.ai (Customize > Skills, "Upload .zip");
#   - a copy in the GitHub Copilot skills folders (a repo's .github/skills, or ~/.copilot/skills).
# The exported SKILL.md keeps only `name` and `description` in the frontmatter, replaces the
# $ARGUMENTS placeholder (Claude Code only) with "what I wrote in my message", and adds a note.
# The hooks and the verifier subagent are not exported: they only work in Claude Code.
# Idempotent. An existing, different SKILL.md in a Copilot folder is first saved as SKILL.md.bak-*.
#
# Usage: scripts/export-skills.sh [--zip [DIR]] [--copilot-repo PATH] [--copilot-user] [--skills a,b]
#   --zip [DIR]          write <skill>.zip files to DIR (default: ./dist/skills). Default if no target is given.
#   --copilot-repo PATH  copy to PATH/.github/skills/<skill>/SKILL.md
#   --copilot-user       copy to ~/.copilot/skills/<skill>/SKILL.md ($COPILOT_HOME if set)
#   --skills a,b         only these skills (default: all)
set -euo pipefail

usage() { echo "Usage: $0 [--zip [DIR]] [--copilot-repo PATH] [--copilot-user] [--skills a,b]" >&2; exit 2; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_DIR="$ROOT/plugins/starterkit/skills"
DO_ZIP=0; ZIP_DIR=""; REPO=""; USER_LEVEL=0; ONLY=""

while [ $# -gt 0 ]; do
  case "$1" in
    --zip) DO_ZIP=1; if [ $# -gt 1 ] && [ "${2#--}" = "$2" ]; then ZIP_DIR="$2"; shift; fi ;;
    --copilot-repo) [ $# -gt 1 ] || usage; REPO="$2"; shift ;;
    --copilot-user) USER_LEVEL=1 ;;
    --skills) [ $# -gt 1 ] || usage; ONLY="$2"; shift ;;
    *) usage ;;
  esac
  shift
done
if [ "$DO_ZIP" -eq 0 ] && [ -z "$REPO" ] && [ "$USER_LEVEL" -eq 0 ]; then DO_ZIP=1; fi
[ -n "$ZIP_DIR" ] || ZIP_DIR="$PWD/dist/skills"

if [ -n "$REPO" ] && [ ! -d "$REPO" ]; then echo "Not a directory: $REPO" >&2; exit 1; fi

# Skill names to export, validated against the folders that exist.
NAMES=""
for d in "$SKILLS_DIR"/*/; do
  n="$(basename "$d")"
  if [ -n "$ONLY" ] && ! printf ',%s,' "$ONLY" | grep -q ",$n,"; then continue; fi
  NAMES="$NAMES $n"
done
if [ -n "$ONLY" ]; then
  for want in $(printf '%s' "$ONLY" | tr ',' ' '); do
    case " $NAMES " in *" $want "*) ;; *) echo "Unknown skill: $want" >&2; exit 1 ;; esac
  done
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

NOTE='> Note: this skill was written for Claude Code. If a command, tool or file it mentions is not available here, say so and continue without it.'

# Writes the portable SKILL.md of skill $1 to stdout.
transform() {
  tr -d '\r' < "$SKILLS_DIR/$1/SKILL.md" | awk -v note="$NOTE" '
    NR==1 && $0=="---" { infm=1; print; next }
    infm && $0=="---" { infm=0; print; print ""; print note; next }
    infm { if ($0 ~ /^(name|description):/) print; next }
    { gsub(/\$ARGUMENTS/, "what I wrote in my message"); print }'
}

make_zip() { # $1 = staging dir containing <skill>/SKILL.md, $2 = skill, $3 = output zip
  rm -f "$3"
  if command -v zip >/dev/null 2>&1; then
    (cd "$1" && zip -qrD "$3" "$2")
  elif PY="$(command -v python3 || command -v python)" && [ -n "$PY" ]; then
    "$PY" - "$1" "$2" "$3" <<'PY'
import sys, zipfile
src, name, out = sys.argv[1:4]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(f"{src}/{name}/SKILL.md", f"{name}/SKILL.md")
PY
  else
    echo "Need 'zip' or 'python3' to build the zip files." >&2; exit 1
  fi
}

copy_skill() { # $1 = skill, $2 = skills root
  local dest="$2/$1/SKILL.md"
  mkdir -p "$2/$1"
  if [ -f "$dest" ]; then
    if cmp -s "$TMP/$1/SKILL.md" "$dest"; then echo "Already up to date: $dest"; return; fi
    local b="$dest.bak-$(date +%Y%m%d%H%M%S)" n=1
    while [ -e "$b" ]; do b="$dest.bak-$(date +%Y%m%d%H%M%S)-$n"; n=$((n+1)); done
    cp "$dest" "$b"; echo "Backup: $b"
  fi
  cp "$TMP/$1/SKILL.md" "$dest"; echo "Updated $dest"
}

[ "$DO_ZIP" -eq 1 ] && mkdir -p "$ZIP_DIR"
for n in $NAMES; do
  mkdir -p "$TMP/$n"
  transform "$n" > "$TMP/$n/SKILL.md"
  if [ "$DO_ZIP" -eq 1 ]; then
    OUT="$(cd "$ZIP_DIR" && pwd)/$n.zip"
    make_zip "$TMP" "$n" "$OUT"; echo "Zip: $OUT"
  fi
  [ -z "$REPO" ] || copy_skill "$n" "$REPO/.github/skills"
  if [ "$USER_LEVEL" -eq 1 ]; then copy_skill "$n" "${COPILOT_HOME:-$HOME/.copilot}/skills"; fi
done
