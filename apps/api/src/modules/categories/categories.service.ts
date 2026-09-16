import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { Category, CreateCategoryInput } from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { categories, transactions } from '../../db/schema.js'
import { mapPostgresError } from '../../common/postgres-error.js'

function toCategory(row: typeof categories.$inferSelect): Category {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
  }
}

@Injectable()
export class CategoriesService {
  constructor(@Inject(DB) private readonly db: Db) {}

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

  async delete(userId: string, id: string): Promise<void> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [inUse] = await tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.categoryId, id)).limit(1)
      if (inUse) {
        throw new ConflictException('Category is used by existing transactions; reassign them before deleting')
      }
      const [row] = await tx.delete(categories).where(eq(categories.id, id)).returning()
      if (!row) {
        throw new NotFoundException('Category not found')
      }
    })
  }
}
