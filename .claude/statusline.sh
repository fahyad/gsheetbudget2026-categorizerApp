#!/usr/bin/env bash
# .claude/statusline.sh
# -----------------------------------------------------------------------------
# Status line — runs frequently, output appears in Claude Code's status area.
# Format: <branch>[ *<dirty>] · <as-version>[⚠]
#
# Examples:
#   main · v11.18
#   pwa/pixel-ui-redesign *2 · v11.18
#   main · v11.17⚠     (Code.js says v11.17 but VERSION.txt says different)
#
# Performance budget: <50 ms. All ops are local git + grep.
# -----------------------------------------------------------------------------

set -u

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$REPO_ROOT" ]; then
  exit 0
fi
cd "$REPO_ROOT"

BRANCH="$(git branch --show-current 2>/dev/null || echo '?')"

DIRTY="$(git status --short 2>/dev/null | wc -l | tr -d ' ')"
DIRTY_STR=""
if [ "$DIRTY" -gt 0 ] 2>/dev/null; then
  DIRTY_STR=" *${DIRTY}"
fi

VTXT=""
if [ -f "apps-script/VERSION.txt" ]; then
  VTXT="$(head -1 apps-script/VERSION.txt 2>/dev/null | tr -d '[:space:]')"
fi

# Drift indicator: VERSION.txt vs Code.js APP_SCRIPT_VERSION mismatch
DRIFT=""
if [ -f "apps-script/Code.js" ] && [ -n "$VTXT" ]; then
  VCODE="$(grep '^var APP_SCRIPT_VERSION' apps-script/Code.js 2>/dev/null \
            | sed -E "s/.*'(v[0-9]+\.[0-9]+)'.*/\1/")"
  if [ -n "$VCODE" ] && [ "$VCODE" != "$VTXT" ]; then
    DRIFT="⚠"
  fi
fi

if [ -z "$VTXT" ]; then
  echo "$BRANCH$DIRTY_STR"
else
  echo "$BRANCH$DIRTY_STR · $VTXT$DRIFT"
fi
