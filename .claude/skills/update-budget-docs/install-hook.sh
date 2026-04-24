#!/usr/bin/env bash
# install-hook.sh — installs a pre-commit hook that combines:
#   1. API key / secret detection (blocks the leaked key + naive secret patterns)
#   2. Docs lint (runs lint.sh when CLAUDE.md / docs/*.md / apps-script/Code.js
#      are staged; blocks on 🔴 issues, advisory on 🟡 / 🔵)
#
# Run once after cloning the repo:
#   bash .claude/skills/update-budget-docs/install-hook.sh
#
# Idempotent — safe to re-run. Backs up an existing pre-commit hook if one
# is present and differs from what we'd install.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
HOOK_PATH="$REPO_ROOT/.git/hooks/pre-commit"

if [ ! -d "$REPO_ROOT/.git" ]; then
  echo "ERROR: $REPO_ROOT is not a git repo (no .git/ dir)" >&2
  exit 1
fi

# The hook itself. Heredoc → file.
NEW_HOOK=$(cat <<'HOOK_EOF'
#!/usr/bin/env bash
# Pre-commit hook for the budget repo.
# Installed by .claude/skills/update-budget-docs/install-hook.sh.
# Two checks:
#   (A) Block commits containing the leaked API key or naive secret patterns.
#   (B) Run docs lint (lint.sh) when documentation files are staged.

set -e

# ============================================================
# (A) Secret detection
# ============================================================
PATTERNS=(
  'p0LiMHcdpP0xeYaN0gBCnk4z91Pjhf4czZ0OjVS1'
  'apiKey\s*=\s*["'\''][A-Za-z0-9+/]{30,}'
  'KEY\s*=\s*["'\''][A-Za-z0-9+/]{30,}'
)

STAGED=$(git diff --cached --name-only --diff-filter=ACM)
if [ -z "$STAGED" ]; then
  exit 0
fi

SECRET_VIOLATIONS=0
for pattern in "${PATTERNS[@]}"; do
  for file in $STAGED; do
    if [ ! -f "$file" ]; then continue; fi
    # Skip .claude/skills/** — the skill source legitimately contains the
    # leaked-key pattern string (it IS the detector).
    if echo "$file" | grep -q "^\.claude/skills/"; then continue; fi
    if git diff --cached "$file" | grep -E "^\+.*$pattern" > /dev/null 2>&1; then
      echo "BLOCKED: $file appears to contain a secret matching pattern: $pattern" >&2
      SECRET_VIOLATIONS=$((SECRET_VIOLATIONS+1))
    fi
  done
done

if [ $SECRET_VIOLATIONS -gt 0 ]; then
  echo "" >&2
  echo "Pre-commit hook blocked $SECRET_VIOLATIONS suspected secret(s) above." >&2
  echo "If false positives, refine patterns in .git/hooks/pre-commit." >&2
  echo "If real, scrub the secret from the staged diff before committing." >&2
  exit 1
fi

# ============================================================
# (B) Docs lint — only when relevant files are staged
# ============================================================
DOCS_TOUCHED=$(echo "$STAGED" | grep -E "^(CLAUDE\.md|docs/.*\.md|apps-script/Code\.js|apps-script/VERSION\.txt)$" || true)

if [ -n "$DOCS_TOUCHED" ]; then
  REPO_ROOT_FROM_HOOK="$(git rev-parse --show-toplevel)"
  LINT_SCRIPT="$REPO_ROOT_FROM_HOOK/.claude/skills/update-budget-docs/lint.sh"

  if [ ! -x "$LINT_SCRIPT" ]; then
    echo "⚠️  Docs files staged but lint.sh not found at $LINT_SCRIPT — skipping docs lint." >&2
    echo "    (Pull main or run install-hook.sh again if the skill is missing.)" >&2
    exit 0
  fi

  echo "📋 Docs files staged — running update-budget-docs lint..." >&2
  if ! bash "$LINT_SCRIPT" >&2; then
    echo "" >&2
    echo "❌ Docs lint blocked the commit. Fix the 🔴 issues above and re-stage." >&2
    echo "   To bypass (NOT RECOMMENDED): git commit --no-verify" >&2
    exit 1
  fi
fi

exit 0
HOOK_EOF
)

# Backup existing hook if it differs
if [ -f "$HOOK_PATH" ]; then
  EXISTING_HASH=$(shasum "$HOOK_PATH" | awk '{print $1}')
  NEW_HASH=$(echo "$NEW_HOOK" | shasum | awk '{print $1}')
  if [ "$EXISTING_HASH" = "$NEW_HASH" ]; then
    echo "✓ Pre-commit hook is already up to date — no change."
    exit 0
  else
    BACKUP="$HOOK_PATH.bak.$(date +%Y%m%d-%H%M%S)"
    cp "$HOOK_PATH" "$BACKUP"
    echo "→ Existing hook differed; backed up to $BACKUP"
  fi
fi

echo "$NEW_HOOK" > "$HOOK_PATH"
chmod +x "$HOOK_PATH"
echo "✓ Pre-commit hook installed at $HOOK_PATH"
echo ""
echo "It will:"
echo "  1. Block commits containing the leaked API key or naive secret patterns"
echo "  2. Run lint.sh when CLAUDE.md / docs/*.md / apps-script/Code.js or VERSION.txt are staged"
echo ""
echo "To bypass (use sparingly): git commit --no-verify"
