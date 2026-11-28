# Claude agents

GitHub issues are the task queue. Claude agents running **on the Pi** work them into pull requests, and the owner reviews them. Every agent is a background Claude Code session with Remote Control on, so you can join any of them at any time: open the link on claude.ai/code or in the Claude app, or run `claude attach finai-issue-N` on the Pi.

The runner is `scripts/agents/agentd.py`, run every minute by cron. Nothing runs on GitHub's machines; GitHub is only where tasks, PRs and comments live.

| Label | Meaning |
|---|---|
| `agent` | Queue this issue. The agent plans, opens a draft PR and implements without waiting. |
| `interactive` | Queue it too, but the agent stops after the plan and waits for your OK |
| `priority:high` | Starts before other queued issues |
| `agent:blocked` | Set by the agent when it needs you; your next message clears it |
| `agent:review` | Set by the agent when the PR is ready for review |

Only the owner can add labels, so labelling an issue is what approves it.

## Flow

1. **Label an issue** `agent` or `interactive`. When a slot is free (`AGENT_MAX_PARALLEL`, default 2), the Pi creates a worktree in `~/agents/worktrees/issue-N` on branch `agent/issue-N`, installs dependencies, and starts session `finai-issue-N`. The issue gets a **status comment**, edited in place, with the session link and the attach command.
2. **Plan, visible early.** The agent writes `docs/plans/issue-N.md` and opens a **draft PR** right away (description from `docs/agents/pr-template.md`), then works step by step: it pushes each step and ticks it off in the PR's Status checklist.
3. **Hand-over.** It runs `pnpm typecheck && pnpm lint && pnpm test`, rewrites the PR description, marks the PR ready, labels the issue `agent:review`, and waits.
4. **Questions and changes.** You can talk to the session directly, or comment `@claude …` on the issue or the PR. For several line comments, use **Start a review** and put `@claude` in the summary. The runner forwards your comments to that issue's session: it stops the session and resumes the same conversation with your comments as the next message. The agent that wrote the code answers questions on GitHub, or makes the change: it updates the plan (and the issue if the scope changed), pushes, re-checks and refreshes the PR. `@claude` on a PR that isn't from an agent starts a session for that PR's branch.

To open the code with one click, use the PR description's **Code in browser** link (github.dev), or open the worktree on the Pi (VS Code Remote-SSH: `~/agents/worktrees/issue-N`).

## Running out of usage, nudges, idle sessions

- Agents use the Claude subscription logged in on the Pi, the **same usage as your own Claude Code**. To keep daytime usage for yourself, set `AGENT_START_HOURS` (e.g. `0-8` starts new tasks only overnight), or set `AGENT_MODEL=sonnet` to stretch usage.
- A session that sits idle for `AGENT_NUDGE_AFTER_MIN` (30) while its task is unfinished gets nudged to continue. This is how work picks back up after a usage limit resets. A session that is waiting for you should set `agent:blocked` instead.
- Sessions in review are stopped after 90 idle minutes, and blocked ones after 8 hours, to free memory. Their conversation is kept: your next `@claude` comment resumes it.
- When an issue or PR is closed, its session is removed and its worktree deleted, unless it has uncommitted or unpushed work.

## Commands (on the Pi)

```
~/agents/FinAI/scripts/agents/agentd.py status          # tasks, session state, idle time, links
~/agents/FinAI/scripts/agents/agentd.py cleanup issue-N  # stop + remove a task's session and worktree
claude agents                                           # all background sessions
claude attach finai-issue-N                             # join one in the terminal
tail -f ~/agents/agentd.log
```
Settings: `~/agents/config` (applied on the next tick).

## Safety

The agents run on your Pi with your GitHub and Claude credentials, so:
- Only the owner's words are instructions. Labels need triage access. Forwarded comments are filtered to the owner. Agents read issues through an author filter and treat all other text as data.
- The Pi only polls GitHub; nothing on GitHub can make it run code.
- Permission mode `auto`: routine edits, git/gh/pnpm run freely, and risky actions are checked by Claude Code's safety classifier. Join the session to approve anything it won't do on its own.
- Keeping the repository **private** removes strangers' issues and comments from what agents might read at all.

## Setup

Once, on the Pi:
1. `gh` logged in with repo access; Claude Code logged in (`claude`).
2. `scripts/agents/install.sh`: clones the repo to `~/agents/FinAI` (kept on `main`), writes `~/agents/config`, and adds the cron entry.
3. `cd ~/agents && claude` once, and accept the trust prompt.
