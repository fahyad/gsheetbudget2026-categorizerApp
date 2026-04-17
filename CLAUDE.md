# CLAUDE.md — Orientation for new sessions

You're in the **2026 Personal Budget + Transaction Categorizer** repo. This file orients you in 60 seconds. Then read `docs/task_plan.md` for current state and `docs/findings.md` for technical reference.

## What this is

Two interconnected systems for one user (the repo owner):
1. **Google Sheets budget workbook** — driven by Apps Script (`apps-script/Code.js`)
2. **Mobile PWA categorizer** — vanilla HTML/JS at root (`index.html`, `js/`, `css/`, `sw.js`)

The PWA calls the Apps Script via a deployed web app URL.

## ⚠️ READ THIS BEFORE TOUCHING APPS SCRIPT

**Apps Script lives at `apps-script/Code.js`** (managed via [clasp](https://github.com/google/clasp)). Edit there, not in the Apps Script editor.

**To deploy a change, ALWAYS use:**
```bash
cd apps-script
./deploy.sh "vNN — short description"
```

**NEVER use plain `clasp deploy`** — it creates a new deployment with a new URL. The PWA is hardcoded to one URL. Plain `clasp deploy` silently breaks production.

The production deployment ID is `AKfycbw2EbHNk_Co2NN_RQknwLLAVXTtm7lPpKHjJqmvDw33ofmOm_FF-B-sAeSy51sn_kBjyQ`. It's hardcoded in two places (must stay in sync):
- `apps-script/deploy.sh` → `PROD_DEPLOYMENT_ID`
- `js/config.js` → `DEFAULT_API_URL` (the URL embeds this ID)

## Current versions
- **Apps Script:** v9 (Logs tab + LockService + write verification)
- **PWA:** v0.7 (batch sync + hardcoded URL + key-only setup)

## Common commands

```bash
# Deploy Apps Script change (correct)
cd apps-script && ./deploy.sh "v10 — what changed"

# View live Cloud Logging from Apps Script
cd apps-script && clasp logs --watch

# See what files clasp will push
cd apps-script && clasp status

# List deployments (should be 7 — HEAD + 6 versions)
cd apps-script && clasp deployments

# Pull edits made via the Apps Script editor (rare)
cd apps-script && clasp pull

# Open Apps Script editor in browser
cd apps-script && clasp open
```

## PWA changes
PWA is plain static files at the repo root. GitHub Pages auto-deploys from `main`. To deploy:
```bash
git add . && git commit -m "..." && git push
```
Bump `<span class="version">vX.Y</span>` in `index.html` AND `CACHE_VERSION` in `sw.js` when shipping a real change (otherwise users get cached old code).

## File map

| Path | Purpose |
|------|---------|
| `index.html`, `js/`, `css/`, `sw.js`, `manifest.json` | PWA (GitHub Pages) |
| `apps-script/Code.js` | Apps Script source (1600+ lines) |
| `apps-script/deploy.sh` | One-command production deploy |
| `apps-script/.clasp.json` | Apps Script project link (scriptId + rootDir) |
| `apps-script/.claspignore` | Allowlist (only Code.js + appsscript.json get pushed) |
| `docs/task_plan.md` | Current state + phases — **read this first** |
| `docs/findings.md` | Technical reference (architecture, bugs, decisions) |
| `docs/progress.md` | Session log (chronological) |

## Things that will trip you up (lessons from past sessions)

1. **`getLastRow()` lies on formula-filled sheets.** Transactions tab has formulas in rows 2–1000 that return `""`. `getLastRow()` reports 1000, not the real last data row. Always use `findNextEmptyRow_()` (scans column A) — already fixed in v9.

2. **POST body is lost on Apps Script 302 redirects.** Use GET with URL params for everything. `doGet()` routes all 6 actions; `doPost()` is kept for curl testing only.

3. **Plain `clasp deploy` creates a new URL.** Always use `./deploy.sh` or `clasp deploy -i AKfycbw2EbHNk_...`.

4. **The Apps Script editor and clasp can both edit Code.gs.** If the user makes an edit in the editor, run `clasp pull` BEFORE editing locally to avoid clobbering.

5. **Categories tab is named "Setup", not "Categories".** Categories live in Setup `D2:E100` (Main, Sub).

6. **Pending tab uses `status='pending'` to gate inclusion.** Once status is "categorized", parseAndFetch ignores it.

7. **API key is in Apps Script Script Properties** (set via Budget Tools → Set API Key menu). Never hardcoded.

8. **The user already manually pasted v9 to Apps Script** before clasp migration. The remote and local are in sync as of clasp clone.

## When in doubt
- Check `docs/task_plan.md` for current state
- Check `docs/findings.md` "⚠️ CRITICAL: Always update the existing deployment" section
- Check the Logs tab in the Google Sheet for recent API activity
- Run `clasp deployments` to confirm you haven't accidentally created extras
