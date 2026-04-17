#!/bin/bash
# Deploy the Apps Script to the production web app (same URL the PWA points at).
# Usage: ./deploy.sh "short description of this version"
#
# This updates deployment AKfycbw2EbHNk_... (version @7+) in place — the URL
# the PWA is configured with stays the same. Never use plain `clasp deploy`
# without -i, which creates a NEW URL and breaks the PWA.

set -e

PROD_DEPLOYMENT_ID="AKfycbw2EbHNk_Co2NN_RQknwLLAVXTtm7lPpKHjJqmvDw33ofmOm_FF-B-sAeSy51sn_kBjyQ"

if [ -z "$1" ]; then
  echo "Usage: ./deploy.sh \"description of this version\""
  echo "Example: ./deploy.sh \"v10 — fix currency formatting\""
  exit 1
fi

cd "$(dirname "$0")"

echo "→ Pushing Code.js to Apps Script..."
clasp push

echo "→ Deploying to production (same URL as PWA)..."
clasp deploy -i "$PROD_DEPLOYMENT_ID" -d "$1"

echo "✓ Done. PWA will pick up the new code on next request."
