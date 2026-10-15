import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Profile, UpdateProfileInput } from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { profiles } from '../../db/schema.js'
import { StorageService } from '../../storage/storage.module.js'
import { TransactionsService } from '../transactions/transactions.service.js'

type ProfileRow = typeof profiles.$inferSelect

const AVATAR_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export interface UploadAvatarInput {
  buffer: Buffer
  mimetype: string
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name)

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(TransactionsService) private readonly transactions: TransactionsService,
  ) {}

  private async toProfile(row: ProfileRow): Promise<Profile> {
    return {
      id: row.id,
      displayName: row.displayName,
      homeCurrencyCode: row.homeCurrencyCode,
      countryCode: row.countryCode,
      avatarUrl: row.avatarPath ? await this.storage.avatarUrl(row.avatarPath) : null,
      createdAt: row.createdAt.toISOString(),
    }
  }

  async getProfile(userId: string): Promise<Profile> {
    const row = await runInTenantContext(this.db, userId, async (tx) => {
      const [found] = await tx.select().from(profiles).where(eq(profiles.id, userId))
      return found
    })
    if (!row) {
      throw new NotFoundException('Profile not found')
    }
    return this.toProfile(row)
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<Profile> {
    const { row, homeCurrencyChanged } = await runInTenantContext(this.db, userId, async (tx) => {
      const [before] = await tx.select().from(profiles).where(eq(profiles.id, userId))
      const [updated] = await tx.update(profiles).set(input).where(eq(profiles.id, userId)).returning()
      return {
        row: updated,
        homeCurrencyChanged: !!before && !!updated && before.homeCurrencyCode !== updated.homeCurrencyCode,
      }
    })
    if (!row) {
      throw new NotFoundException('Profile not found')
    }
    // Changing home currency re-prices every transaction's materialized value.
    if (homeCurrencyChanged) {
      try {
        await this.transactions.recomputeForUser(userId)
      } catch (error) {
        this.logger.warn(`FX recompute after home-currency change failed: ${String(error)}`)
      }
    }
    return this.toProfile(row)
  }

  /**
   * Each upload gets a fresh object path (so browsers never show a cached old
   * photo); the previous object is removed once the profile points at the new one.
   */
  async uploadAvatar(userId: string, input: UploadAvatarInput): Promise<Profile> {
    const extension = AVATAR_EXTENSIONS[input.mimetype]
    if (!extension) {
      throw new BadRequestException('Profile photo must be a PNG, JPEG, WebP or GIF image')
    }
    const path = `${userId}/${randomUUID()}.${extension}`
    await this.storage.uploadAvatar(path, input.buffer, input.mimetype)

    const { previousPath, row } = await runInTenantContext(this.db, userId, async (tx) => {
      const [current] = await tx.select({ avatarPath: profiles.avatarPath }).from(profiles).where(eq(profiles.id, userId))
      const [updated] = await tx.update(profiles).set({ avatarPath: path }).where(eq(profiles.id, userId)).returning()
      return { previousPath: current?.avatarPath ?? null, row: updated }
    })
    if (!row) {
      throw new NotFoundException('Profile not found')
    }
    if (previousPath) {
      await this.storage.removeAvatar(previousPath).catch((error: unknown) => {
        this.logger.warn(`Could not remove old avatar ${previousPath}: ${String(error)}`)
      })
    }
    return this.toProfile(row)
  }
}
