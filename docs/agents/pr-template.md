<!--
Template the Claude agents (scripts/agents/agentd.py) follow for PR descriptions. Replace every <...>.
Keep the "Status" checklist up to date while working.
-->
Closes #<issue>

**Open:** [Code in browser](https://github.dev/<owner/repo>/pull/<pr>) · [Files changed](https://github.com/<owner/repo>/pull/<pr>/files) · [Plan](https://github.com/<owner/repo>/blob/<branch>/docs/plans/issue-<issue>.md)

## Status
- [ ] Plan written
- [ ] <one box per implementation step from the plan>
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Description finalized, ready for review

## Summary
<2–4 sentences: what the user can now do or what is fixed, and why.>

## Changes
<Grouped by area (API / web / shared-types / DB). For each: what changed and why; link key files.>

## Design decisions
<Choices made and alternatives rejected. Anything in the issue that was interpreted or left out, and why.>

## Schema / data
<New migrations and matching `apps/api/src/db/schema.ts` edits, or "None".>

## How it was tested
<Commands run with results; new or changed tests; manual checks.>

## How to review
<Suggested reading order and what to try in the preview, step by step.>

## Risks and follow-ups
<What could break, invariants from AGENTS.md this touches, things deliberately not done.>
