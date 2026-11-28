#!/usr/bin/env bash
# Stop issue N's interactive session and remove its worktree.
# Refuses if the worktree has uncommitted changes or unpushed commits.
# The conversation is kept (`claude --resume` still lists it).
# usage: scripts/agents/cleanup.sh <issue-number>
set -euo pipefail
source "$(dirname "$(readlink -f "$0")")/env.sh"

ISSUE=${1:?usage: cleanup.sh <issue-number>}
WT=$WORKTREES/issue-$ISSUE
STATE=$STATE_DIR/issue-$ISSUE

if [ -d "$WT" ]; then
  if [ -n "$(git -C "$WT" status --porcelain --untracked-files=no)" ]; then
    echo "$WT has uncommitted changes; commit/push or discard them first." >&2; exit 1
  fi
  if [ -n "$(git -C "$WT" log --oneline '@{u}..' 2>/dev/null)" ]; then
    echo "$WT has unpushed commits; push them first." >&2; exit 1
  fi
fi

if [ -f "$STATE" ]; then
  source "$STATE"
  [ -n "${ID:-}" ] && { claude stop "$ID" >/dev/null 2>&1 || true; claude rm "$ID" >/dev/null 2>&1 || true; }
  rm -f "$STATE"
fi
[ -d "$WT" ] && git -C "$REPO_DIR" worktree remove "$WT"
echo "Cleaned up issue #$ISSUE"
