# AGENTS.md

FinAI: personal finance tracker. pnpm monorepo — `apps/web` (React 19 + Vite PWA), `apps/api` (NestJS 10 + Fastify, ESM), `packages/shared-types` (zod schemas), `supabase/` (SQL migrations + seed). Full product/architecture context lives in `README.md` — read it before non-trivial work.

## Commands

- `pnpm dev` — builds `shared-types` first, then runs web + api + shared-types watch in parallel. Web dev server proxies `/api` → `localhost:3001`.
- `pnpm build` — ordered: shared-types → web → api.
- `pnpm lint` — oxlint, zero-config (no config file; shared-types lint is a no-op echo).
- `pnpm typecheck` — per-package `tsc --noEmit` (web uses `tsc -b`).
- `pnpm test` — only `apps/api` has a test script (`vitest run`). **No test files exist yet** (`apps/api/test/{e2e,fixtures}` are empty scaffolding), so this currently fails with "No test files found". Web has no test script. There is no CI.
- Single package: `pnpm --filter api|web|shared-types run <script>`.
- **Demo data**: `pnpm seed:demo` (no-op if the demo user exists) / `pnpm seed:demo:reset` (delete + reseed, deterministic) / `pnpm reset:demo` (db reset + reseed) / `pnpm setup:dev` (full local bring-up) / `pnpm generate:csv -- --rows N` (writes a CIBC-style import-test CSV; `apps/api/src/seed/generate-import-csv.ts`). Seeder lives in `apps/api/src/seed/` (tsx, excluded from the prod build; needs Supabase running + `apps/api/.env`; refuses non-local backends unless `ALLOW_NON_LOCAL_SEED=true`). The demo user's Everyday Checking account has a `CIBC card export` import profile matching `generate:csv` output and real CIBC statements.

## Setup

1. `pnpm install`
2. `pnpm exec supabase start` (requires Docker; DB on 54322, Supabase API on 54321)
3. Copy `apps/api/.env.example` → `.env`, `apps/web/.env.local.example` → `.env.local`; fill from `supabase start` output. Note: the web example has a typo — `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are mashed onto one line.
4. `pnpm dev`

## Hard-won invariants (violating these breaks security or correctness)

- **`DATABASE_URL` must use the `app_service` role, never `postgres`/superuser/table-owner** — Postgres silently bypasses RLS for those roles, disabling tenant isolation. Local: `postgresql://app_service:app_service_password@127.0.0.1:54322/postgres` (created by `supabase/migrations/*_create_app_service_role.sql`).
- **Every tenant-scoped DB query must run inside `runInTenantContext(db, userId, fn)`** (`apps/api/src/db/tenant-context.ts`). It opens a transaction and sets `set_config('app.current_user_id', userId, true)`, which every RLS policy checks. SET LOCAL only survives inside that transaction — never split the two steps. All existing services follow this; new ones must too.
- **Frontend supabase-js is auth-only.** All data flows through the NestJS REST API (`/api/*`, Bearer JWT, JWKS-verified by `SupabaseAuthGuard`). Never query Postgres from the web app.
- **Schema is maintained in two places by hand**: `supabase/migrations/*.sql` (source of truth, applied by the Supabase CLI; timestamped filenames) and `apps/api/src/db/schema.ts` (drizzle typed schema, query-only). drizzle-kit is installed but **not** used for migrations (no `drizzle.config`). Any schema change needs both updated, plus a new migration file. Use `supabase db reset` to re-apply migrations + `seed.sql` locally.
- **`apps/api` is pure ESM** (`"type": "module"`, tsconfig NodeNext): relative imports need explicit `.js` extensions (`import ... from './schema.js'`).
- **`shared-types` is consumed as built `dist/` output**, not source. After editing it, rebuild (`pnpm --filter shared-types run build`) or typecheck/builds in the apps won't see the change. Root `pnpm dev` handles this automatically.

## Domain rules baked into the code

- Canonical sign convention: `amount` is **negative = expense, positive = income**, normalized once at ingestion. All downstream math is plain `SUM(amount)`.
- Nominal vs. "real" view (reconciliation collapse + month-split expansion + FX conversion) is computed **on read, never stored**, and lives once in `ReportingQueryService` (`apps/api/src/modules/reporting/reporting-query.service.ts`), reused by the transactions display endpoint and charts. Don't reimplement this logic elsewhere.
- A transaction cannot be both reconciled and month-split — enforced at the service layer, not the DB.
- Reconciliation and month-splits are non-destructive: member/split rows only; underlying transactions are never mutated.
- Account balance is computed: `starting_balance` + transactions dated after `balance_as_of` (the cutoff prevents double-counting backfilled history).
