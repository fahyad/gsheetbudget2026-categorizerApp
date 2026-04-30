#!/usr/bin/env bash
# .claude/state-check.sh
# -----------------------------------------------------------------------------
# SessionStart hook — runs once at every Claude Code session start. The stdout
# of this script gets injected into Claude's first context window, so a new
# session lands with project state already in mind.
#
# This replaces the manual "First thing to do in any new session" ritual at
# the top of CLAUDE.md. The ritual was right; relying on Claude to remember
# to run it was the failure mode (see commit 0a316cc — production was running
# v11.14 while every doc said v11.13 because nobody noticed the drift).
#
# Performance budget: under 500 ms. All ops below are local git + file reads.
#
# Output format: deliberately plain text (not JSON) because plain reads better
# in the transcript when the user reviews what context Claude was given.
# -----------------------------------------------------------------------------

set -u

# Find repo root. If we're not in a git checkout (e.g., the script is being
# inspected from outside), exit 0 silently — the hook should never block
# session start.
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$REPO_ROOT" ]; then
  exit 0
fi
cd "$REPO_ROOT"

echo "============================================================"
echo "Project state — Budget Categorizer"
echo "============================================================"
echo ""

# -----------------------------------------------------------------------------
# Branch + sync state vs origin
# -----------------------------------------------------------------------------

BRANCH="$(git branch --show-current 2>/dev/null || echo unknown)"
LOCAL_REV="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

echo "Branch:    $BRANCH ($LOCAL_REV)"

# Upstream may not exist (e.g., local-only branch). Tolerate gracefully.
REMOTE_REV="$(git rev-parse --short '@{u}' 2>/dev/null || echo '')"
if [ -n "$REMOTE_REV" ]; then
  if [ "$LOCAL_REV" = "$REMOTE_REV" ]; then
    echo "vs origin: in sync"
  else
    AHEAD="$(git rev-list --count '@{u}..HEAD' 2>/dev/null || echo '?')"
    BEHIND="$(git rev-list --count 'HEAD..@{u}' 2>/dev/null || echo '?')"
    echo "vs origin: ahead $AHEAD, behind $BEHIND  (origin: $REMOTE_REV)"
  fi
else
  echo "vs origin: no upstream tracked"
fi

# -----------------------------------------------------------------------------
# Uncommitted changes
# -----------------------------------------------------------------------------

DIRTY_COUNT="$(git status --short 2>/dev/null | wc -l | tr -d ' ')"
if [ "$DIRTY_COUNT" -gt 0 ]; then
  echo "Uncommitted: $DIRTY_COUNT file(s)"
  # First 8 names, indented. More than that and the listing crowds the context.
  git status --short 2>/dev/null | head -8 | sed 's/^/             /'
  if [ "$DIRTY_COUNT" -gt 8 ]; then
    echo "             ($((DIRTY_COUNT - 8)) more)"
  fi
else
  echo "Uncommitted: none"
fi

echo ""

# -----------------------------------------------------------------------------
# Recent commits (last 5, oneline) — gives Claude the recency context
# -----------------------------------------------------------------------------

echo "Recent commits:"
git log --oneline -5 2>/dev/null | sed 's/^/  /'

echo ""

# -----------------------------------------------------------------------------
# Versions — Apps Script + PWA + service worker cache
# Catches the v11.14-class drift early: VERSION.txt vs Code.js disagreement.
# -----------------------------------------------------------------------------

echo "Versions:"

VTXT=""
if [ -f "apps-script/VERSION.txt" ]; then
  VTXT="$(head -1 apps-script/VERSION.txt 2>/dev/null | tr -d '[:space:]')"
  echo "  VERSION.txt:        $VTXT"
fi

VCODE=""
if [ -f "apps-script/Code.js" ]; then
  VCODE="$(grep '^var APP_SCRIPT_VERSION' apps-script/Code.js 2>/dev/null \
            | sed -E "s/.*'(v[0-9]+\.[0-9]+)'.*/\1/")"
  if [ -n "$VTXT" ] && [ -n "$VCODE" ] && [ "$VCODE" != "$VTXT" ]; then
    echo "  Code.js:            $VCODE  ⚠ DRIFT vs VERSION.txt"
  else
    echo "  Code.js:            $VCODE"
  fi
fi

if [ -f "js/config.js" ]; then
  VPWA="$(grep 'APP_VERSION' js/config.js 2>/dev/null | head -1 \
           | sed -E "s/.*'(v[0-9]+\.[0-9]+(\.[0-9]+)?)'.*/\1/")"
  echo "  PWA APP_VERSION:    $VPWA"
fi

if [ -f "sw.js" ]; then
  VCACHE="$(grep 'CACHE_VERSION' sw.js 2>/dev/null | head -1 \
             | sed -E "s/.*'(v[0-9]+)'.*/\1/")"
  echo "  SW CACHE_VERSION:   $VCACHE"
fi

echo ""

# -----------------------------------------------------------------------------
# Branch hint
# -----------------------------------------------------------------------------

if [ "$BRANCH" != "main" ] && [ "$BRANCH" != "master" ]; then
  echo "ℹ Currently on a feature branch. main may be at a different version."
  echo ""
fi

echo "Tip: run 'bash .claude/state-check.sh' anytime to refresh this snapshot."
echo "============================================================"
