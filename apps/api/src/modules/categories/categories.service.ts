import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { Category, CreateCategoryInput } from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { categories } from '../../db/schema.js'
import { mapPostgresError } from '../../common/postgres-error.js'

function toCategory(row: typeof categories.$inferSelect): Category {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    isArchived: row.isArchived,
    createdAt: row.createdAt.toISOString(),
  }
}

@Injectable()
export class CategoriesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Every category the user owns, archived included — callers filter archived out of pickers but need them to resolve historical transactions. */
  async list(userId: string): Promise<Category[]> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const rows = await tx.select().from(categories).orderBy(categories.name)
      return rows.map(toCategory)
    })
  }

  async create(userId: string, input: CreateCategoryInput): Promise<Category> {
    return runInTenantContext(this.db, userId, async (tx) => {
      try {
        const [row] = await tx.insert(categories).values({ userId, name: input.name }).returning()
        return toCategory(row)
      } catch (error) {
        mapPostgresError(error)
      }
    })
  }

  async rename(userId: string, id: string, name: string): Promise<Category> {
    return runInTenantContext(this.db, userId, async (tx) => {
      try {
        const [row] = await tx.update(categories).set({ name }).where(eq(categories.id, id)).returning()
        if (!row) {
          throw new NotFoundException('Category not found')
        }
        return toCategory(row)
      } catch (error) {
        mapPostgresError(error)
      }
    })
  }

  /**
   * Soft delete: archives the category so it disappears from pickers while
   * the transactions that used it keep it (and still display its name).
   */
  async archive(userId: string, id: string): Promise<Category> {
    return runInTenantContext(this.db, userId, async (tx) => {
      try {
        const [row] = await tx.update(categories).set({ isArchived: true }).where(eq(categories.id, id)).returning()
        if (!row) {
          throw new NotFoundException('Category not found')
        }
        return toCategory(row)
      } catch (error) {
        mapPostgresError(error)
      }
    })
  }
}
