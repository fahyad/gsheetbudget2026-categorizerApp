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

# Update the LAST_EDITED timestamp in Code.js to right now
TIMESTAMP=$(date "+%Y-%m-%d %H:%M %Z")
sed -i '' "s|^var APP_SCRIPT_LAST_EDITED = .*|var APP_SCRIPT_LAST_EDITED = '$TIMESTAMP';|" Code.js

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
