/**
 * Demo-user seeder (run via `pnpm seed:demo`, or `pnpm seed:demo:reset` to
 * wipe + recreate; `scripts/dev-setup.sh` runs it as the last bring-up step).
 *
 * Creates the auth user through the Supabase admin API (version-agnostic —
 * raw SQL into auth.users is brittle across GoTrue versions and the
 * on_auth_user_created trigger handles the profile), then inserts the
 * deterministic dataset from demo-data.ts inside runInTenantContext using
 * the app_service role — RLS stays genuinely enforced, same as the app.
 *
 * Idempotent by default: if the demo user already exists it no-ops (a
 * re-run of dev-setup never clobbers manual test edits). --reset deletes
 * the user — every tenant table cascades from auth.users — and reseeds.
 * Refuses non-local backends unless ALLOW_NON_LOCAL_SEED=true.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { CARD_COLOR_PALETTE } from 'shared-types'
import { eq, isNull } from 'drizzle-orm'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createDb } from '../db/client.js'
import { runInTenantContext } from '../db/tenant-context.js'
import { accounts, categories, fxRates, importProfiles, monthSplits, profiles, reconciliationGroupMembers, reconciliationGroups, transactions } from '../db/schema.js'
import { validateEnv } from '../config/env.js'
import { buildDemoDataset, REQUIRED_PRESET_CATEGORIES, type DemoTransaction } from './demo-data.js'

const RESET = process.argv.includes('--reset')
const DEFAULT_EMAIL = 'demo@finai.test'
const DEFAULT_PASSWORD = 'demo-password-123'

/** Minimal .env loader (no dotenv dependency): fills only unset vars from apps/api/.env. */
function loadDotEnvFile(path: string): void {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex <= 0) continue
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

async function findUserByEmail(client: SupabaseClient, email: string): Promise<string | null> {
  const target = email.toLowerCase()
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`Failed to list users: ${error.message}`)
    const found = data.users.find((u) => u.email?.toLowerCase() === target)
    if (found) return found.id
    if (data.users.length < 200) return null
  }
  return null
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function toInsert(t: DemoTransaction, userId: string, categoryIdByName: Map<string, string>) {
  return {
    id: t.id,
    userId,
    date: t.date,
    amount: t.amount.toFixed(2),
    currencyCode: t.currencyCode,
    description: t.description,
    categoryId: t.category ? (categoryIdByName.get(t.category) ?? null) : null,
    accountId: t.accountId,
    sourceType: 'manual' as const,
  }
}

async function main(): Promise<void> {
  loadDotEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)))

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.DATABASE_URL) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DATABASE_URL — copy apps/api/.env.example to apps/api/.env and fill it (see README).')
  }
  const env = validateEnv(process.env)

  const hostname = new URL(env.SUPABASE_URL).hostname
  const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname) || hostname.endsWith('.localhost')
  if (!isLocal && process.env.ALLOW_NON_LOCAL_SEED !== 'true') {
    throw new Error(`Refusing to seed non-local backend (${hostname}). Set ALLOW_NON_LOCAL_SEED=true to override.`)
  }

  const demoEmail = process.env.DEMO_USER_EMAIL ?? DEFAULT_EMAIL
  const demoPassword = process.env.DEMO_USER_PASSWORD ?? DEFAULT_PASSWORD

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const existingId = await findUserByEmail(supabase, demoEmail)
  if (existingId && !RESET) {
    console.log(`Demo user ${demoEmail} already exists — nothing to do. (re-seed with: pnpm seed:demo:reset)`)
    return
  }
  if (existingId) {
    console.log('Deleting existing demo user (all demo data cascades)…')
    const { error } = await supabase.auth.admin.deleteUser(existingId)
    if (error) throw new Error(`Failed to delete demo user: ${error.message}`)
  }

  console.log(`Creating demo user ${demoEmail}…`)
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: demoEmail,
    password: demoPassword,
    email_confirm: true,
  })
  if (createError) throw new Error(`Failed to create demo user: ${createError.message}`)
  const userId = created.user!.id

  const dataset = buildDemoDataset()
  console.log(`Inserting demo dataset (${dataset.accounts.length} accounts, ${dataset.transactions.length} transactions)…`)

  const { client, db } = createDb(env.DATABASE_URL)
  try {
    await runInTenantContext(db, userId, async (tx) => {
      await tx.update(profiles).set({ displayName: dataset.displayName }).where(eq(profiles.id, userId))

      await tx.insert(fxRates).values(
        dataset.fxRates.map((r) => ({ userId, baseCurrency: r.baseCurrency, quoteCurrency: r.quoteCurrency, rate: String(r.rate) })),
      )

      const presetRows = await tx.select({ id: categories.id, name: categories.name }).from(categories).where(isNull(categories.userId))
      const categoryIdByName = new Map(presetRows.map((c) => [c.name, c.id]))
      const missing = REQUIRED_PRESET_CATEGORIES.filter((name) => !categoryIdByName.has(name))
      if (missing.length > 0) {
        throw new Error(`Preset categories missing: ${missing.join(', ')} — run \`pnpm exec supabase db reset\` first (seed.sql inserts them), then re-run the seeder.`)
      }
      const customRows = await tx.insert(categories).values(dataset.customCategories.map((name) => ({ userId, name }))).returning({ id: categories.id, name: categories.name })
      for (const row of customRows) categoryIdByName.set(row.name, row.id)

      await tx.insert(accounts).values(
        dataset.accounts.map((a, index) => ({
          id: a.id,
          userId,
          name: a.name,
          type: a.type,
          institution: a.institution,
          currencyCode: a.currencyCode,
          startingBalance: a.startingBalance.toFixed(2),
          balanceAsOf: a.balanceAsOf,
          // Same round-robin the API uses for new accounts, so every demo card gets its own colour.
          cardColor: CARD_COLOR_PALETTE[index % CARD_COLOR_PALETTE.length],
        })),
      )

      for (const batch of chunk(dataset.transactions, 100)) {
        await tx.insert(transactions).values(batch.map((t) => toInsert(t, userId, categoryIdByName)))
      }

      await tx.insert(reconciliationGroups).values(
        dataset.reconciliationGroups.map((g) => ({ id: g.id, userId, label: g.label })),
      )
      const members = dataset.reconciliationGroups.flatMap((g) => g.transactionIds.map((transactionId) => ({ groupId: g.id, transactionId })))
      if (members.length > 0) await tx.insert(reconciliationGroupMembers).values(members)

      if (dataset.monthSplits.length > 0) {
        await tx.insert(monthSplits).values(dataset.monthSplits.map((s) => ({ transactionId: s.transactionId, startMonth: s.startMonth, numMonths: s.numMonths })))
      }

      if (dataset.importProfile) {
        const { id, accountId, name, hasHeader, delimiter, dateFormat, columnMapping } = dataset.importProfile
        await tx.insert(importProfiles).values({ id, userId, accountId, name, hasHeader, delimiter, dateFormat, columnMapping })
      }
    })
  } finally {
    await client.end()
  }

  console.log('\nDemo dataset seeded:')
  console.log(`  login:     ${demoEmail}`)
  console.log(`  password:  ${demoPassword}`)
  console.log(`  accounts:  ${dataset.accounts.length} — ${dataset.accounts.map((a) => `${a.name} (${a.type}, ${a.currencyCode})`).join('; ')}`)
  console.log(`  tx count:  ${dataset.transactions.length}`)
  console.log(`  groups:    ${dataset.reconciliationGroups.length}, month splits: ${dataset.monthSplits.length}`)
  console.log('  note:      the Legacy GBP Account has no FX rate on purpose — it exercises the excluded-from-net-worth warning on Home.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
