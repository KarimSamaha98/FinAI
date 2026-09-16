import { sql } from 'drizzle-orm'
import type { Db } from './client.js'

/**
 * Every tenant-scoped query must run inside this wrapper: it opens a
 * transaction, sets the session-local `app.current_user_id` GUC that every
 * RLS policy checks (see supabase/migrations/*_initial_schema.sql), then runs
 * the callback against that same transaction. SET LOCAL only applies within
 * the current transaction, so the two steps cannot be split across queries.
 */
export async function runInTenantContext<T>(db: Db, userId: string, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_user_id', ${userId}, true)`)
    return fn(tx as unknown as Db)
  })
}
