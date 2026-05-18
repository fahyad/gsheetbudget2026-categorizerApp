#!/bin/bash
# Deploy the Apps Script to the production web app (same URL the PWA points at).
# Usage: ./deploy.sh "short description of this version"
#
# This updates deployment AKfycbw2EbHNk_... in place — the URL the PWA is
# configured with stays the same. Never use plain `clasp deploy` without -i,
# which creates a NEW URL and breaks the PWA.
#
# Auto-bumps:
#   - APP_SCRIPT_LAST_EDITED constant in Code.js (sed)
#   - VERSION.txt (read by sheet's "update needed" check via GitHub raw URL)
#
# To bump the VERSION number itself: edit APP_SCRIPT_VERSION in Code.js
# manually before running this script. Otherwise the version stays the same
# and only the timestamp updates.

set -e

PROD_DEPLOYMENT_ID="AKfycbw2EbHNk_Co2NN_RQknwLLAVXTtm7lPpKHjJqmvDw33ofmOm_FF-B-sAeSy51sn_kBjyQ"

if [ -z "$1" ]; then
  echo "Usage: ./deploy.sh \"description of this version\""
  echo "Example: ./deploy.sh \"v10.2 — version display in sheet\""
  exit 1
fi

cd "$(dirname "$0")"

# ============================================================
# Pre-flight: deploy-but-not-committed guard (added 2026-04-26)
# ============================================================
# Without this, the v11.14 incident can recur: substantive Code.js edits
# get pushed to Apps Script via `clasp push`, the local file is later
# discarded (branch switch / git checkout / clean install), and the
# deployed code lives only in production with no source-of-truth in git.
# Recovery requires `clasp pull`. See commit 0a316cc for the case.
#
# RULE: deploy.sh refuses to proceed if Code.js has substantive
# uncommitted changes (anything beyond the LAST_EDITED timestamp line —
# that line is rewritten by this script every run, so it's allowed).
#
# Override: FORCE=1 ./deploy.sh "..." (only if you really know what
# you're doing — e.g., you just ran clasp pull to recover and need to
# redeploy quickly).

if [ -z "${FORCE:-}" ]; then
  # Are there any uncommitted changes to Code.js outside the LAST_EDITED line?
  SUBSTANTIVE_DIFF=$(git diff HEAD -- Code.js 2>/dev/null | grep -E "^[+-]" | grep -vE "^[+-]{3}" | grep -v "APP_SCRIPT_LAST_EDITED" || true)
  if [ -n "$SUBSTANTIVE_DIFF" ]; then
    echo "✗ DEPLOY BLOCKED — Code.js has uncommitted changes beyond the LAST_EDITED timestamp."
    echo ""
    echo "Why this guard exists:"
    echo "  Code that's pushed to Apps Script via clasp but never committed to git can be"
    echo "  silently lost (see commit 0a316cc 'Recover v11.14 source via clasp pull')."
    echo ""
    echo "Fix:"
    echo "  git add apps-script/Code.js"
    echo "  git commit -m \"vX.Y - what changed\""
    echo "  git push"
    echo "  ./deploy.sh \"...\""
    echo ""
    echo "Override (only if you know what you're doing):"
    echo "  FORCE=1 ./deploy.sh \"...\""
    exit 1
  fi

  # Warn (not block) if HEAD is unpushed — the commit exists locally but
  # could still be lost to a clean reinstall.
  LOCAL_REV=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
  REMOTE_REV=$(git rev-parse '@{u}' 2>/dev/null || echo "")
  if [ -n "$REMOTE_REV" ] && [ "$LOCAL_REV" != "$REMOTE_REV" ]; then
    BRANCH=$(git branch --show-current 2>/dev/null || echo "<branch>")
    echo "⚠ WARNING: HEAD ($LOCAL_REV) is not pushed to origin ($REMOTE_REV)."
    echo "  After this deploy, run: git push origin $BRANCH"
    echo ""
  fi
fi

# Update the LAST_EDITED timestamp in Code.js to right now.
# B8: use sed -i.bak (portable across BSD/macOS and GNU/Linux) and then
# remove the .bak file. The previous `sed -i ''` form was BSD-only and
# silently broke on Linux.
TIMESTAMP=$(date "+%Y-%m-%d %H:%M %Z")
sed -i.bak "s|^var APP_SCRIPT_LAST_EDITED = .*|var APP_SCRIPT_LAST_EDITED = '$TIMESTAMP';|" Code.js && rm -f Code.js.bak

# Read the VERSION constant out of Code.js (single source of truth — bump manually)
VERSION=$(grep "^var APP_SCRIPT_VERSION" Code.js | sed "s/.*'\(.*\)';/\1/")
if [ -z "$VERSION" ]; then
  echo "✗ Could not read APP_SCRIPT_VERSION from Code.js — aborting"
  exit 1
fi

# Write VERSION.txt — this is fetched from GitHub raw URL by the sheet to
# determine "update needed" status. Must match what's in Code.js.
printf "%s\n%s\n" "$VERSION" "$TIMESTAMP" > VERSION.txt

echo "→ Version $VERSION  (last edited $TIMESTAMP)"
echo "→ Pushing Code.js to Apps Script..."
clasp push

echo "→ Deploying to production (same URL as PWA)..."
clasp deploy -i "$PROD_DEPLOYMENT_ID" -d "$1"

echo "✓ Done. Version $VERSION live. PWA + sheet will reflect it on next refresh."
echo "  Note: open the sheet → Budget Tools → Refresh Version Info to update the display block."
