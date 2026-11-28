#!/usr/bin/env bash
# Runs every minute from cron (see install.sh). Starts an interactive session
# for each open issue labelled `interactive` that doesn't have one yet, and
# resumes a stopped session when the label is removed and added again.
# Also keeps the dedicated clone on the latest main, which updates these scripts.
set -uo pipefail
source "$(dirname "$(readlink -f "$0")")/env.sh"

exec 9>"$STATE_DIR/watch.lock"
flock -n 9 || exit 0

cd "$REPO_DIR" || exit 1
git pull -q --ff-only origin main 2>/dev/null || log "could not fast-forward $REPO_DIR"
REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner) || exit 1
SCRIPT_DIR="$REPO_DIR/scripts/agents"

for n in $(gh issue list -R "$REPO" --state open --label interactive --json number --jq '.[].number'); do
  state=$STATE_DIR/issue-$n
  if [ ! -f "$state" ]; then
    "$SCRIPT_DIR/interactive.sh" "$n"
    continue
  fi
  # Session exists from before: restart only if it stopped AND the label was
  # (re)applied after it started; otherwise a finished session would respawn every minute.
  SESSION_ID=""; source "$state"
  pid=$(session_field sessionId "$SESSION_ID" pid)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then continue; fi
  labeled_at=$(gh api "repos/$REPO/issues/$n/events" --paginate \
    --jq '.[] | select(.event == "labeled" and .label.name == "interactive") | .created_at' | tail -1)
  [ -n "$labeled_at" ] || continue
  if [ "$(date -d "$labeled_at" +%s)" -gt "$(stat -c %Y "$state")" ]; then
    "$SCRIPT_DIR/interactive.sh" "$n"
  fi
done
