/**
 * Syncs the global `currencies` reference table with everything the rate
 * provider supports, so users can pick any of them. Run once after deploy and
 * whenever new currencies appear upstream.
 *
 * Run (needs apps/api/.env):
 *   pnpm --filter api exec tsx src/seed/sync-currencies.ts
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createDb } from '../db/client.js'
import { validateEnv } from '../config/env.js'
import { currencies } from '../db/schema.js'
import { FrankfurterProvider } from '../modules/exchange-rates/frankfurter.provider.js'

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

async function main(): Promise<void> {
  loadDotEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)))
  const env = validateEnv(process.env)
  const { client, db } = createDb(env.DATABASE_URL)
  const provider = new FrankfurterProvider()

  try {
    const list = await provider.fetchCurrencies()
    if (list.length === 0) {
      console.log('Provider returned no currencies; nothing to sync.')
      return
    }
    for (const currency of list) {
      await db
        .insert(currencies)
        .values({
          code: currency.code,
          name: currency.name,
          symbol: currency.symbol,
          startDate: currency.startDate,
          endDate: currency.endDate,
        })
        .onConflictDoUpdate({
          target: currencies.code,
          set: { name: currency.name, symbol: currency.symbol, startDate: currency.startDate, endDate: currency.endDate },
        })
    }
    console.log(`Synced ${list.length} currencies.`)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
