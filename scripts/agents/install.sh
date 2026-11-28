#!/usr/bin/env bash
# One-time setup of interactive agent sessions on this Pi:
#   - a dedicated clone of the repo in ~/agents/FinAI (kept on main by the watcher)
#   - a cron entry running watch.sh every minute
# Safe to re-run.
# usage: scripts/agents/install.sh
set -euo pipefail
source "$(dirname "$(readlink -f "$0")")/env.sh"

origin=$(git -C "$(dirname "$(readlink -f "$0")")" remote get-url origin)
if [ ! -d "$REPO_DIR/.git" ]; then
  git clone -q "$origin" "$REPO_DIR"
  echo "Cloned $origin to $REPO_DIR"
fi
git -C "$REPO_DIR" pull -q --ff-only origin main
[ -x "$REPO_DIR/scripts/agents/watch.sh" ] || { echo "scripts/agents isn't on main yet: merge it first." >&2; exit 1; }

line="* * * * * $REPO_DIR/scripts/agents/watch.sh >> $AGENTS_HOME/watch.log 2>&1"
if ! crontab -l 2>/dev/null | grep -qF "scripts/agents/watch.sh"; then
  (crontab -l 2>/dev/null || true; echo "$line") | crontab -
  echo "Added cron entry: $line"
fi

cat <<EOF

Done. One manual step: Claude Code must trust $AGENTS_HOME before it can start
sessions in worktrees there. Run once and accept the prompt, then exit:

  cd $AGENTS_HOME && claude

Then label an issue \`interactive\`. Within a minute the issue gets a link to the session.
Log: $AGENTS_HOME/watch.log    Sessions: claude agents    Clean up: $REPO_DIR/scripts/agents/cleanup.sh <n>
EOF
