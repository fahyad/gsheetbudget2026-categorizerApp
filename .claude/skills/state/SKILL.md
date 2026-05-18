---
name: state
description: Show current project state snapshot — branch, sync vs origin, uncommitted files, recent commits, version pointers (Apps Script + PWA + SW cache), drift warnings. Use when the user types "/state", asks "what's the state", "where are we", or any time you want to refresh context mid-session. Same output the SessionStart hook injects at session start.
---

# state

Refresh your view of the project state by running the state-check script.

## What to do

1. Run: `bash .claude/state-check.sh`
2. Show the full output to the user verbatim. Don't summarize unless they ask.
3. If anything stands out (any of these), call it out explicitly above the snapshot:
   - `⚠ DRIFT vs VERSION.txt` — production may be running different code than the repo says
   - `behind` or `ahead` count > 0 — branch out of sync with origin
   - Uncommitted file count > 5 — significant working changes
   - `Currently on a feature branch` line present — main may be at a different version

## When NOT to invoke

Don't run this proactively just to check state. The SessionStart hook already does that at the start of every session. Use this skill only when the user explicitly asks, OR when you need a fresh snapshot mid-session (e.g., after a commit + push, before a deploy).
