/**
 * One-off backfill for existing data: recompute every transaction's
 * home-currency value (exchange_rate + converted_value) using the automatic
 * market rates. Needed after the exchange_rates migration is deployed, since
 * rows created before it have no materialized value.
 *
 * Run (needs Supabase running + apps/api/.env):
 *   pnpm --filter api exec tsx src/seed/recompute-fx.ts                 # all users
 *   pnpm --filter api exec tsx src/seed/recompute-fx.ts --email me@x.com  # one user
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createDb } from '../db/client.js'
import { validateEnv } from '../config/env.js'
import { ExchangeRatesService } from '../modules/exchange-rates/exchange-rates.service.js'
import { ExchangeRateRepository } from '../modules/exchange-rates/exchange-rate-repository.js'
import { FrankfurterProvider } from '../modules/exchange-rates/frankfurter.provider.js'
import { TransactionsService } from '../modules/transactions/transactions.service.js'

function loadDotEnvFile(path: string): void {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex <= 0) continue
    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1).trim()
    if (process.env[key] === undefined) process.env[key] = value
  }
}

async function listUserIds(client: SupabaseClient, emailOnly: string | null): Promise<string[]> {
  const ids: string[] = []
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`Failed to list users: ${error.message}`)
    for (const user of data.users) {
      if (emailOnly && user.email?.toLowerCase() !== emailOnly.toLowerCase()) continue
      ids.push(user.id)
    }
    if (data.users.length < 200) break
  }
  return ids
}

async function main(): Promise<void> {
  loadDotEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)))
  const env = validateEnv(process.env)
  const emailFlag = process.argv.indexOf('--email')
  const emailOnly = emailFlag >= 0 ? (process.argv[emailFlag + 1] ?? null) : null

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { client, db } = createDb(env.DATABASE_URL)
  const transactions = new TransactionsService(db, new ExchangeRatesService(new ExchangeRateRepository(db), new FrankfurterProvider()))

  try {
    const userIds = await listUserIds(admin, emailOnly)
    if (userIds.length === 0) {
      console.log('No matching users.')
      return
    }
    let total = 0
    for (const userId of userIds) {
      const count = await transactions.recomputeForUser(userId)
      total += count
      console.log(`  ${userId}: ${count} transactions`)
    }
    console.log(`Recomputed ${total} transactions across ${userIds.length} user(s).`)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
