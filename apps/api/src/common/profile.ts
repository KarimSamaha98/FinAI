import { UnauthorizedException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { profiles } from '../db/schema.js'

/**
 * The signed-in user's home currency, read inside a tenant transaction.
 *
 * The auth guard only verifies the token's signature, so a token can still be
 * valid for a user that no longer exists — e.g. an open browser session
 * outliving `seed:demo:reset`, which deletes and recreates the demo user with a
 * new id. RLS then hides every tenant row, so the profile lookup comes back
 * empty. Surface that as 401 (rather than dereferencing the undefined row) so
 * the client signs out and re-authenticates.
 */
export async function loadHomeCurrency(tx: Db, userId: string): Promise<string> {
  const [row] = await tx
    .select({ homeCurrencyCode: profiles.homeCurrencyCode })
    .from(profiles)
    .where(eq(profiles.id, userId))
  if (!row) {
    throw new UnauthorizedException('Your session is no longer valid — please sign in again')
  }
  return row.homeCurrencyCode
}
