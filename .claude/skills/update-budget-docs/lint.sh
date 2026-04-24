#!/usr/bin/env bash
# Consistency checks across the 4 .md files + VERSION.txt + Code.js.
# Run from anywhere — the script cd's to the repo root.
#
# Exit codes:
#   0 = clean (no blocking issues)
#   1 = blocking issues found
#
# Output: grouped by severity (🔴 BLOCKING, 🟡 WARNING, 🔵 INFO).

set -u

# --- Locate repo root ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

if [ ! -f "CLAUDE.md" ] || [ ! -f "apps-script/Code.js" ]; then
  echo "ERROR: lint.sh couldn't find the repo root (expected CLAUDE.md and apps-script/Code.js)."
  echo "Script location: $SCRIPT_DIR"
  echo "Computed repo root: $REPO_ROOT"
  exit 2
fi

BLOCKING=0
WARNINGS=0
INFOS=0

section() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "$1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

blocking() {
  echo "🔴 BLOCKING: $1"
  BLOCKING=$((BLOCKING + 1))
}

warning() {
  echo "🟡 WARNING: $1"
  WARNINGS=$((WARNINGS + 1))
}

info() {
  echo "🔵 INFO: $1"
  INFOS=$((INFOS + 1))
}

# ===========================================================
# Check 1: Version pointer consistency
# ===========================================================
section "Check 1: Version pointer consistency"

# Canonical: apps-script/Code.js APP_SCRIPT_VERSION
CANONICAL_VERSION=$(grep -E "^var APP_SCRIPT_VERSION" apps-script/Code.js | sed -E "s/.*'(v[0-9]+\.[0-9]+)'.*/\1/")
if [ -z "$CANONICAL_VERSION" ]; then
  blocking "Could not parse APP_SCRIPT_VERSION from apps-script/Code.js"
else
  echo "  Canonical (Code.js): $CANONICAL_VERSION"

  # 1a. VERSION.txt line 1
  VERSION_TXT=$(head -1 apps-script/VERSION.txt | tr -d '[:space:]')
  if [ "$VERSION_TXT" != "$CANONICAL_VERSION" ]; then
    blocking "apps-script/VERSION.txt says '$VERSION_TXT', Code.js says '$CANONICAL_VERSION'"
  else
    echo "  ✓ VERSION.txt matches"
  fi

  # 1b. CLAUDE.md "Current versions" line
  if ! grep -qE "Apps Script:[^v]*\*\*$CANONICAL_VERSION" CLAUDE.md && \
     ! grep -qE "Apps Script:\*\* $CANONICAL_VERSION" CLAUDE.md; then
    blocking "CLAUDE.md 'Current versions' doesn't reference $CANONICAL_VERSION"
  else
    echo "  ✓ CLAUDE.md Current versions matches"
  fi

  # 1c. task_plan.md Current State
  if ! grep -qE "Apps Script:\*\* $CANONICAL_VERSION" docs/task_plan.md; then
    blocking "docs/task_plan.md Current State doesn't reference $CANONICAL_VERSION"
  else
    echo "  ✓ task_plan.md Current State matches"
  fi

  # 1d. findings.md header
  if ! grep -qE "$CANONICAL_VERSION Apps Script" docs/findings.md; then
    warning "docs/findings.md header doesn't reference '$CANONICAL_VERSION Apps Script' (may use different wording)"
  else
    echo "  ✓ findings.md header matches"
  fi

  # 1e. progress.md Current State header
  if ! grep -qE "\*\*Apps Script:\*\* $CANONICAL_VERSION" docs/progress.md; then
    blocking "docs/progress.md Current State doesn't reference $CANONICAL_VERSION"
  else
    echo "  ✓ progress.md Current State matches"
  fi
fi

# ===========================================================
# Check 2: Duplicate Phase numbers in task_plan.md
# ===========================================================
section "Check 2: task_plan.md Phase numbering"

# Extract all "### Phase N[a-z]?:" identifiers — suffixes like 13b, 13c, 13d
# are sub-phases and count as distinct identifiers. Only full duplicates are
# blocking.
PHASE_IDS=$(grep -E "^### Phase [0-9]+[a-z]?" docs/task_plan.md | sed -E "s/^### Phase ([0-9]+[a-z]?).*/\1/")
DUPS=$(echo "$PHASE_IDS" | sort | uniq -d)
if [ -n "$DUPS" ]; then
  for n in $DUPS; do
    blocking "Duplicate Phase $n in task_plan.md (appears more than once)"
  done
else
  echo "  ✓ No duplicate Phase identifiers"
fi

# Check ordering: phases in "Phases — Completed" should be ascending by NUMBER.
# Sub-phases (13a, 13b, 13c) can interleave with each other under the same
# number but 14 should come after 13x.
awk '/^## Phases — Completed/,/^## Phases — Future/' docs/task_plan.md | \
  grep -E "^### Phase [0-9]+" | \
  sed -E "s/^### Phase ([0-9]+)[a-z]?.*/\1/" > /tmp/phase_order_$$.txt

prev=0
out_of_order=0
while IFS= read -r n; do
  # Numeric compare; allow equal (sub-phases) but not less
  if [ "$n" -lt "$prev" ]; then
    out_of_order=1
    break
  fi
  prev=$n
done < /tmp/phase_order_$$.txt
rm -f /tmp/phase_order_$$.txt

if [ "$out_of_order" -eq 1 ]; then
  warning "Phases in 'Phases — Completed' are out of ascending numeric order (consider reordering)"
else
  echo "  ✓ Phases in ascending order"
fi

# ===========================================================
# Check 3: Every Phase has a Status line
# ===========================================================
section "Check 3: Every Phase has a Status line"

# For each "### Phase N:" heading, check the next 30 lines for "- **Status:**"
MISSING_STATUS=$(awk '
  /^### Phase [0-9]+/ { title=$0; found=0; for(i=0;i<30;i++) { if((getline line) > 0) { if (line ~ /^-[[:space:]]+\*\*Status:\*\*/) { found=1; break } } else break }
    if (found==0) print title }
' docs/task_plan.md)

if [ -n "$MISSING_STATUS" ]; then
  while IFS= read -r line; do
    warning "Missing Status line near: $line"
  done <<< "$MISSING_STATUS"
else
  echo "  ✓ All Phases have Status lines"
fi

# ===========================================================
# Check 4: findings.md postmortems have Symptom + Fix at minimum
# ===========================================================
section "Check 4: findings.md postmortem structure"

# Postmortem detection is STRICT: only flag sections that look like
# postmortems. Heuristic — the section contains at least one of:
#   - "**Root cause:" or "**Issue:" (explicit marker)
#   - "CRITICAL" in title (marker)
#   - "Bug" in title
# Architectural sections like "### Configuration (v0.7)" or "### One-shot
# migration (v11.0)" don't have these markers and should be skipped.
awk '
  /^### [^[]+\(v[0-9]+\.[0-9]+[^)]*\)/ {
    title=$0; sym=0; fix=0; les=0; rc=0; is_pm=0;
    # CRITICAL or Bug in title?
    if (title ~ /CRITICAL/ || title ~ /[Bb]ug/ || title ~ /#REF!/ || title ~ /Crash/) is_pm=1
    body=""
    for (i=0; i<100; i++) {
      if ((getline line) <= 0) break
      if (line ~ /^### /) break
      body = body "\n" line
      if (line ~ /^-[[:space:]]+\*\*Symptom:/) sym=1
      # "Issue:" was the older convention — accept as equivalent to Symptom
      if (line ~ /^-[[:space:]]+\*\*Issue:/) { sym=1; rc=1; is_pm=1 }
      if (line ~ /^-[[:space:]]+\*\*Root cause:/) { rc=1; is_pm=1 }
      if (line ~ /^-[[:space:]]+\*\*Fix/) fix=1
      # "User-directed redesign" is a valid fix section for schema-change postmortems
      if (line ~ /^-[[:space:]]+\*\*User-directed redesign:/) fix=1
      if (line ~ /^-[[:space:]]+\*\*Lesson/) les=1
    }
    # Only enforce postmortem structure if this section looks like a postmortem
    if (is_pm==1) {
      if (sym==0) print "MISSING_SYMPTOM: " title
      if (fix==0) print "MISSING_FIX: " title
      if (les==0) print "MISSING_LESSON: " title
    }
  }
' docs/findings.md > /tmp/pm_check_$$.txt

if [ -s /tmp/pm_check_$$.txt ]; then
  while IFS= read -r line; do
    case "$line" in
      MISSING_SYMPTOM:*) warning "findings.md postmortem missing 'Symptom:' — ${line#MISSING_SYMPTOM: }" ;;
      MISSING_FIX:*) warning "findings.md postmortem missing 'Fix:' — ${line#MISSING_FIX: }" ;;
      MISSING_LESSON:*) info "findings.md postmortem could use 'Lesson:' — ${line#MISSING_LESSON: }" ;;
    esac
  done < /tmp/pm_check_$$.txt
else
  echo "  ✓ All postmortems have Symptom + Fix (Lesson presence is info-only)"
fi
rm -f /tmp/pm_check_$$.txt

# ===========================================================
# Check 5: progress.md sessions have a Status section
# ===========================================================
section "Check 5: progress.md sessions have Status sections"

# Only enforce Status sections on MODERN sessions (those that use the
# current "### Setup / ### Diagnosis / ### Status" convention). Older
# sessions (early April 2026) predate this convention and are historical
# records — don't retrofit. Heuristic: a session is "modern" if it uses
# any of the modern subheadings (### Setup, ### Diagnosis, ### Fix, etc.).
awk '
  /^## Session:/ {
    title=$0; found_status=0; is_modern=0;
    for (i=0; i<200; i++) {
      if ((getline line) <= 0) break
      if (line ~ /^## Session:/) break
      if (line ~ /^### Setup$/) is_modern=1
      if (line ~ /^### Diagnosis$/) is_modern=1
      if (line ~ /^### Investigation$/) is_modern=1
      if (line ~ /^### Fix$/) is_modern=1
      if (line ~ /^### Implementation$/) is_modern=1
      if (line ~ /^### Design/) is_modern=1
      if (line ~ /^### Status/) { found_status=1 }
    }
    if (is_modern==1 && found_status==0) print title
  }
' docs/progress.md > /tmp/sess_check_$$.txt

if [ -s /tmp/sess_check_$$.txt ]; then
  while IFS= read -r line; do
    warning "progress.md session missing '### Status' section: ${line:0:100}"
  done < /tmp/sess_check_$$.txt
else
  echo "  ✓ All sessions have Status sections"
fi
rm -f /tmp/sess_check_$$.txt

# ===========================================================
# Check 6: Trip-up references point to real findings.md sections
# ===========================================================
section "Check 6: CLAUDE.md trip-up references in findings.md"

# Extract quoted section names from CLAUDE.md trip-ups. Format in CLAUDE.md:
# "See `docs/findings.md` \"Title\"."
# The quote is ASCII " (0x22). Extract only the inner string.
grep -oE 'docs/findings\.md` "[^"]+"' CLAUDE.md | sed -E 's/^docs\/findings\.md` "(.*)"$/\1/' | \
while IFS= read -r title; do
  if [ -z "$title" ]; then continue; fi
  # Trim leading/trailing whitespace
  title=$(echo "$title" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')
  # Check for exact heading match. Use fgrep/-F for literal matching.
  if ! grep -qF "### $title" docs/findings.md; then
    # Also try: the title might have special chars we should ignore
    # (e.g., stripped "⚠️" prefix). Loosely match first 25 chars.
    prefix=$(echo "$title" | head -c 25)
    if ! grep -qF "### $prefix" docs/findings.md; then
      warning "CLAUDE.md references findings.md section \"$title\" but no matching heading found"
    fi
  fi
done

# ===========================================================
# Check 7: "User needs to" markers in session history
# ===========================================================
section "Check 7: Stale 'user needs to' markers"

# Find all sessions with "User needs to" in Status
# Heuristic: if a later session exists in the file, the earlier "needs to" is suspicious
# (not definitive — user might still need to do it — but worth flagging).
#
# Extract session dates and "needs to" status lines, compare.

NEEDS_COUNT=$(grep -cE "User needs to|user needs to" docs/progress.md || true)
if [ "$NEEDS_COUNT" -gt 0 ]; then
  # Find the last session heading line number
  LAST_SESSION_LINE=$(grep -n "^## Session:" docs/progress.md | tail -1 | cut -d: -f1)
  # Find all "needs to" lines
  NEEDS_LINES=$(grep -n "User needs to\|user needs to" docs/progress.md | cut -d: -f1)
  STALE=0
  for ln in $NEEDS_LINES; do
    if [ "$ln" -lt "$LAST_SESSION_LINE" ]; then
      STALE=$((STALE + 1))
    fi
  done
  if [ "$STALE" -gt 0 ]; then
    info "$STALE 'user needs to' lines exist BEFORE the last session entry. Verify they're resolved or delete the stale ones."
  else
    echo "  ✓ No obviously-stale 'user needs to' markers"
  fi
else
  echo "  ✓ No 'user needs to' markers in progress.md"
fi

# ===========================================================
# Check 8: Tab list in CLAUDE.md matches sheet reality
# ===========================================================
section "Check 8: Tab list in CLAUDE.md references current tabs"

# Pull the "Tabs in this sheet" line; ensure it mentions 'Saving' if v11.8+
TABS_LINE=$(grep -E "Tabs in this sheet" CLAUDE.md | head -1)
if [ -n "$TABS_LINE" ]; then
  if ! echo "$TABS_LINE" | grep -q "Saving"; then
    warning "CLAUDE.md 'Tabs in this sheet' line doesn't mention 'Saving' — may be stale"
  else
    echo "  ✓ Saving tab listed"
  fi
  if echo "$TABS_LINE" | grep -q "Pending"; then
    warning "CLAUDE.md 'Tabs in this sheet' line mentions 'Pending' — that tab was removed in v11.0"
  fi
fi

# ===========================================================
# Summary
# ===========================================================
section "Summary"

echo "  🔴 Blocking: $BLOCKING"
echo "  🟡 Warnings: $WARNINGS"
echo "  🔵 Info:     $INFOS"
echo ""

if [ "$BLOCKING" -gt 0 ]; then
  echo "❌ Lint FAILED with $BLOCKING blocking issue(s). Fix these before committing docs."
  exit 1
else
  if [ "$WARNINGS" -gt 0 ]; then
    echo "⚠️  Lint passed with $WARNINGS warning(s). Consider fixing."
  else
    echo "✅ Lint clean."
  fi
  exit 0
fi
