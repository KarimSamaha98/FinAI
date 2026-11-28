# Shared settings for the Pi-side agent scripts. Sourced, not executed.
# cron and non-interactive shells don't load nvm, so put node and claude on PATH.
nvm_bin=$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)
export PATH="$HOME/.local/bin:${nvm_bin:+$nvm_bin:}/usr/local/bin:/usr/bin:/bin:$PATH"

AGENTS_HOME=${AGENTS_HOME:-$HOME/agents}  # clone, worktrees, state, log
REPO_DIR=$AGENTS_HOME/FinAI                 # dedicated clone of main, used only by these scripts
WORKTREES=$AGENTS_HOME/worktrees
STATE_DIR=$AGENTS_HOME/state
ENV_SOURCE=${ENV_SOURCE:-$HOME/repos/FinAI} # checkout whose apps/*/.env files are copied into worktrees
mkdir -p "$WORKTREES" "$STATE_DIR"

log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }

# JSON of `claude agents`; field lookup via python (no jq on this machine).
# usage: session_field <match-key> <match-value> <field>
session_field() {
  claude agents --json 2>/dev/null | python3 -c '
import json, sys
k, v, f = sys.argv[1:4]
for s in json.load(sys.stdin):
    if str(s.get(k)) == v:
        print(s.get(f, "")); break
' "$1" "$2" "$3"
}
