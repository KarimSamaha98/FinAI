# CLAUDE.md

@AGENTS.md

## Claude Code notes

- AGENTS.md (imported above) is the single source of truth for commands, setup, invariants and domain rules. Edit it there, not here; keep this file to Claude-specific additions.
- Product/architecture background: `README.md`. Design and feature notes: `docs/design-system/`, `docs/insights/`, `docs/pr/`.
- `recompute:fx` is not a root script: run `pnpm --filter api run recompute:fx` (AGENTS.md's `pnpm recompute:fx` fails at the root).
- Before calling a change done, run `pnpm typecheck && pnpm lint`, plus `pnpm test` if you touched `apps/api`. There is no CI to catch it later.
- If you change a schema, update both `supabase/migrations/` (new timestamped file) and `apps/api/src/db/schema.ts` in the same change.
- If you edit `packages/shared-types`, rebuild it before typechecking the apps.
