import { Inject, Injectable, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { BankConnection, CreateBankConnectionInput } from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { bankConnections } from '../../db/schema.js'
import { mapPostgresError } from '../../common/postgres-error.js'

function toConnection(row: typeof bankConnections.$inferSelect): BankConnection {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    bankSlug: row.bankSlug,
    loginUrl: row.loginUrl,
    status: row.status,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Display/grouping name derived from the pasted login URL — never used for permissions. */
export function bankSlugFromLoginUrl(loginUrl: string): string {
  try {
    return new URL(loginUrl).hostname.toLowerCase()
  } catch {
    return ''
  }
}

@Injectable()
export class BankConnectionsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(userId: string, filter?: { accountId?: string }): Promise<BankConnection[]> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const where = filter?.accountId
        ? and(eq(bankConnections.userId, userId), eq(bankConnections.accountId, filter.accountId))
        : eq(bankConnections.userId, userId)
      const rows = await tx
        .select()
        .from(bankConnections)
        .where(where)
        .orderBy(bankConnections.createdAt)
      return rows.map(toConnection)
    })
  }

  async create(userId: string, input: CreateBankConnectionInput): Promise<BankConnection> {
    const bankSlug = bankSlugFromLoginUrl(input.loginUrl)
    if (!bankSlug) throw new ConflictException('loginUrl is not a valid http(s) URL')

    return runInTenantContext(this.db, userId, async (tx) => {
      const [existing] = await tx
        .select({ id: bankConnections.id, status: bankConnections.status })
        .from(bankConnections)
        .where(eq(bankConnections.accountId, input.accountId))
        .limit(1)
      if (existing) {
        // One connection row per account (unique index) — a disconnected
        // account can be reconnected: re-activate and take the new URL.
        if (existing.status === 'active') {
          throw new ConflictException('This account already has a bank connection — disconnect it first')
        }
        try {
          const [row] = await tx
            .update(bankConnections)
            .set({ status: 'active', bankSlug, loginUrl: input.loginUrl, updatedAt: new Date() })
            .where(eq(bankConnections.id, existing.id))
            .returning()
          return toConnection(row)
        } catch (error) {
          mapPostgresError(error)
        }
      }
      try {
        const [row] = await tx
          .insert(bankConnections)
          .values({
            userId,
            accountId: input.accountId,
            bankSlug,
            loginUrl: input.loginUrl,
            status: 'active',
          })
          .returning()
        return toConnection(row)
      } catch (error) {
        // is_owned_account FK-guard: connecting to another user's account is
        // session takeover, not a data accident.
        if (
          typeof error === 'object' &&
          error !== null &&
          'constraint_name' in error &&
          (error as { constraint_name?: string }).constraint_name === 'bank_connections_account_own_key'
        ) {
          throw new UnauthorizedException('Account does not belong to you')
        }
        mapPostgresError(error)
      }
    })
  }

  async disconnect(userId: string, id: string): Promise<BankConnection> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .update(bankConnections)
        .set({ status: 'disconnected', updatedAt: new Date() })
        .where(and(eq(bankConnections.id, id), eq(bankConnections.userId, userId)))
        .returning()
      if (!row) throw new NotFoundException('Bank connection not found')
      return toConnection(row)
    })
  }

  /** Called by the extension after a captured CSV finished uploading. */
  async markSynced(userId: string, id: string): Promise<BankConnection> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .update(bankConnections)
        .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(bankConnections.id, id), eq(bankConnections.userId, userId)))
        .returning()
      if (!row) throw new NotFoundException('Bank connection not found')
      return toConnection(row)
    })
  }
}
