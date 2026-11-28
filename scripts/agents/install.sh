#!/usr/bin/env bash
# One-time setup of the local Claude agent runner on this Pi. Safe to re-run.
#   - dedicated clone in ~/agents/FinAI (agentd keeps it on main, which also updates agentd itself)
#   - cron entry running agentd.py every minute
#   - ~/agents/config with the defaults, for tuning
# usage: scripts/agents/install.sh
set -euo pipefail
AGENTS_HOME=${AGENTS_HOME:-$HOME/agents}
REPO_DIR=$AGENTS_HOME/FinAI
here=$(dirname "$(readlink -f "$0")")
mkdir -p "$AGENTS_HOME"

if [ ! -d "$REPO_DIR/.git" ]; then
  git clone -q "$(git -C "$here" remote get-url origin)" "$REPO_DIR"
  echo "Cloned the repo to $REPO_DIR"
fi
git -C "$REPO_DIR" pull -q --ff-only origin main
[ -x "$REPO_DIR/scripts/agents/agentd.py" ] || { echo "scripts/agents/agentd.py isn't on main yet: merge it first." >&2; exit 1; }
# Commits made by agents in worktrees of this clone use the identity of the repo's existing commits.
git -C "$REPO_DIR" config user.name >/dev/null || git -C "$REPO_DIR" config user.name "$(git -C "$REPO_DIR" log -1 --format=%an origin/main)"
git -C "$REPO_DIR" config user.email >/dev/null || git -C "$REPO_DIR" config user.email "$(git -C "$REPO_DIR" log -1 --format=%ae origin/main)"

if [ ! -f "$AGENTS_HOME/config" ]; then
  cat > "$AGENTS_HOME/config" <<'EOF'
# Local Claude agent runner settings (see scripts/agents/agentd.py). Changes apply on the next tick.
AGENT_MAX_PARALLEL=2
# Local hours [from-to) in which NEW tasks may start; messages and running tasks are unaffected.
AGENT_START_HOURS=0-24
AGENT_NUDGE_AFTER_MIN=30
AGENT_STOP_REVIEW_AFTER_MIN=90
AGENT_STOP_BLOCKED_AFTER_MIN=480
# e.g. sonnet to stretch subscription usage; empty = account default
AGENT_MODEL=
AGENT_PERMISSION_MODE=auto
EOF
  echo "Wrote $AGENTS_HOME/config"
fi

line="* * * * * $REPO_DIR/scripts/agents/agentd.py tick >> $AGENTS_HOME/agentd.log 2>&1"
if ! crontab -l 2>/dev/null | grep -qF "scripts/agents/agentd.py"; then
  (crontab -l 2>/dev/null || true; echo "$line") | crontab -
  echo "Added cron entry: $line"
fi

cat <<EOF

Done. One manual step: Claude Code must trust $AGENTS_HOME before it can start
sessions in the worktrees there. Run this once, accept the prompt, then exit:

  cd $AGENTS_HOME && claude

Then label an issue \`agent\` (or \`interactive\`); within a minute it gets a status comment with the session link.
  Status:   $REPO_DIR/scripts/agents/agentd.py status
  Log:      $AGENTS_HOME/agentd.log
  Sessions: claude agents
EOF
