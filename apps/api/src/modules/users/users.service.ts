import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { Profile, UpdateProfileInput } from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { profiles } from '../../db/schema.js'

@Injectable()
export class UsersService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async getProfile(userId: string): Promise<Profile> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [row] = await tx.select().from(profiles).where(eq(profiles.id, userId))
      if (!row) {
        throw new NotFoundException('Profile not found')
      }
      return {
        id: row.id,
        displayName: row.displayName,
        homeCurrencyCode: row.homeCurrencyCode,
        createdAt: row.createdAt.toISOString(),
      }
    })
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<Profile> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .update(profiles)
        .set(input)
        .where(eq(profiles.id, userId))
        .returning()
      if (!row) {
        throw new NotFoundException('Profile not found')
      }
      return {
        id: row.id,
        displayName: row.displayName,
        homeCurrencyCode: row.homeCurrencyCode,
        createdAt: row.createdAt.toISOString(),
      }
    })
  }
}
