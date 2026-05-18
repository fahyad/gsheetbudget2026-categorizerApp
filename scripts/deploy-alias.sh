# scripts/deploy-alias.sh
#
# One-line shell function for deploying Apps Script changes from any
# directory. Pulls the latest commits from GitHub, runs the existing
# ./deploy.sh (which has its own pre-deploy guard), then auto-commits +
# pushes the post-deploy timestamp bump so production stays
# reproducible from git.
#
# Why this exists: the GitHub-hosted Claude environments (sandboxed)
# can't deploy because they don't have your local ~/.clasprc.json. They
# can edit + commit + push code, but the deploy step requires running
# clasp on a machine where you've done `clasp login`. This shortcut
# makes "the manual deploy step on my laptop" a one-word command.
#
# Install (one-time, on the machine where you've run `clasp login`):
#
#   echo "" >> ~/.zshrc
#   echo "# Budget repo deploy shortcut" >> ~/.zshrc
#   cat ~/gsheetbudget2026-categorizerApp/scripts/deploy-alias.sh >> ~/.zshrc
#   source ~/.zshrc
#
# Or copy-paste this function manually into your ~/.zshrc / ~/.bashrc.
#
# Usage:
#   deploy "v11.X — short description of what changed"
#
# What it does:
#   1. cd into ~/gsheetbudget2026-categorizerApp
#   2. git pull (gets commits a Claude session pushed from elsewhere)
#   3. cd into apps-script
#   4. ./deploy.sh "$@"  (runs clasp push + clasp deploy; the script
#      itself has a pre-deploy guard that BLOCKS if Code.js has
#      uncommitted substantive changes)
#   5. Auto-commits the timestamp bump that deploy.sh just made and
#      pushes back to origin (lets the pre-commit hook validate via
#      lint.sh — won't bypass it)
#
# Override the auto-commit: set NO_AUTO_COMMIT=1 before the call. Useful
# if you're mid-investigation and don't want a chore commit yet:
#
#   NO_AUTO_COMMIT=1 deploy "v11.X — testing"

deploy() {
  if [ -z "$1" ]; then
    echo "Usage: deploy \"vX.Y — short description\""
    return 1
  fi

  local repo_dir="$HOME/gsheetbudget2026-categorizerApp"
  if [ ! -d "$repo_dir" ]; then
    echo "✗ deploy: repo not found at $repo_dir"
    return 1
  fi

  pushd "$repo_dir" > /dev/null || return 1

  echo "→ Pulling latest from origin..."
  if ! git pull; then
    echo "✗ deploy: git pull failed (resolve and retry)"
    popd > /dev/null
    return 1
  fi

  cd apps-script || { popd > /dev/null; return 1; }

  echo "→ Running deploy.sh..."
  if ! ./deploy.sh "$@"; then
    echo "✗ deploy: deploy.sh failed (see above)"
    cd ..
    popd > /dev/null
    return 1
  fi

  cd ..

  # Auto-commit the post-deploy timestamp bump so production stays
  # reproducible from git. Skip if NO_AUTO_COMMIT is set.
  if [ -z "${NO_AUTO_COMMIT:-}" ]; then
    if ! git diff --quiet HEAD -- apps-script/Code.js apps-script/VERSION.txt 2>/dev/null; then
      echo "→ Auto-committing post-deploy timestamp bump..."
      git add apps-script/Code.js apps-script/VERSION.txt
      if git commit -m "chore: post-deploy timestamp bump for $1"; then
        if git push; then
          echo "✓ Deploy complete + committed + pushed."
        else
          echo "⚠ Deploy + commit done, but git push failed. Push manually."
        fi
      else
        echo "⚠ Deploy done, but auto-commit was rejected (likely pre-commit hook caught something). Inspect with 'git status' and fix."
      fi
    else
      echo "✓ Deploy complete. (No timestamp diff to commit — nothing changed.)"
    fi
  else
    echo "✓ Deploy complete. (NO_AUTO_COMMIT=1, skipping auto-commit. Manual: git add apps-script/{Code.js,VERSION.txt} && git commit && git push)"
  fi

  popd > /dev/null
}
