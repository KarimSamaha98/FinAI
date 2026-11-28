# Claude agents

GitHub issues are the task queue. Claude agents work them into pull requests and the owner reviews them.

| Label | Meaning |
|---|---|
| `agent` | A cloud agent should work this issue (only the owner can add labels, so this is the approval) |
| `priority:high` | Picked first by the morning sweep |
| `interactive` | Worked in a live session on the Pi instead; cloud agents leave it alone |
| `agent:review` | Agent finished; the PR is waiting for review |

## Flows

**Issue → PR** (`.github/workflows/claude-agent.yml`). Add `agent` to an issue. The agent writes `docs/plans/issue-N.md` and opens a **draft PR right away**, so you can read the plan while it implements. Each step is pushed and ticked off in the PR's Status checklist. When done it runs `pnpm typecheck && pnpm lint && pnpm test`, writes the description from `.github/claude/pr-template.md`, marks the PR ready and labels the issue `agent:review`.
To steer it, comment `@claude …` on the issue: the run restarts and acts on your comment first.

**Questions and changes on a PR** (`.github/workflows/claude-pr.yml`). Comment `@claude …` on the PR. Questions are answered with no install and no code changes. Change requests update the plan (and the issue if the scope changed), get implemented, re-checked and pushed, and the PR description is refreshed.
For several line comments, use **Start a review** and put `@claude` in the review summary when you submit: one run handles the whole review.

**Morning sweep** (`.github/workflows/claude-morning.yml`). At 06:00 Toronto time (EST) it works every open `agent` issue without `agent:review` or `interactive`, `priority:high` first, 3 at a time. You can also run it from the Actions tab with a different concurrency. A run that hits the usage limit comments on its issue; the next sweep continues it.

**Interactive on the Pi** (`scripts/agents/`). Add `interactive` to an issue. Within a minute the Pi starts a background Claude session in `~/agents/worktrees/issue-N` (same `agent/issue-N` branch) with Remote Control on, and comments a link on the issue. Open it on claude.ai/code or the Claude app, or run `claude attach finai-issue-N` on the Pi. The session posts its plan and waits for you before implementing.
To hand the issue back, remove `interactive`; cloud agents continue from the branch and plan. Adding the label again resumes the Pi conversation. When finished: `~/agents/FinAI/scripts/agents/cleanup.sh N`.

## Continuity

Every cloud run on a branch resumes the previous Claude session for that branch, saved in the GitHub Actions cache (`claude-session-<branch>-…`): steering comments, PR requests and the morning sweep all continue the same conversation as the agent that wrote the code. If no session is saved (cache entries expire after 7 days unused), a run starts fresh from the branch, the plan and the PR, which is why agents keep `docs/plans/issue-N.md` current.
Pi sessions and cloud sessions don't share conversations; they share the branch and the plan file.

## Safety

The repo is public, so:
- Only the owner can start work: the `agent`/`interactive` labels, and `@claude` comments only from the owner. Comments by anyone else are never acted on.
- Agents use the workflow `GITHUB_TOKEN`, so their comments and PRs can't trigger further runs.
- No self-hosted runner: the Pi polls GitHub (`watch.sh`) instead of executing jobs GitHub sends it.
- Sessions are kept in the Actions cache, not as artifacts (artifacts on public repos are downloadable).

## Setup

Done once:
- Repo secret `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`): agents use the Claude subscription's usage.
- Settings → Actions → "Allow GitHub Actions to create and approve pull requests" enabled.
- Labels above created.
- Pi: `scripts/agents/install.sh` (clone in `~/agents/FinAI`, cron entry), then `cd ~/agents && claude` once to trust the folder. Log: `~/agents/watch.log`.
