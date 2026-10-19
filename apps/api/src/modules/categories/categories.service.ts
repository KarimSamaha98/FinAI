import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { count, eq } from 'drizzle-orm'
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
    icon: (row.icon as Category['icon']) ?? null,
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
        const [row] = await tx.insert(categories).values({ userId, name: input.name, icon: input.icon ?? null }).returning()
        return toCategory(row)
      } catch (error) {
        mapPostgresError(error)
      }
    })
  }

  async rename(userId: string, id: string, name: string, icon: Category['icon'] | undefined): Promise<Category> {
    return runInTenantContext(this.db, userId, async (tx) => {
      try {
        const [row] = await tx
          .update(categories)
          .set({ name, ...(icon !== undefined ? { icon } : {}) })
          .where(eq(categories.id, id))
          .returning()
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

  /** How many of the user's transactions carry this category — shown before a permanent remove. */
  async usage(userId: string, id: string): Promise<{ transactionCount: number }> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [category] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.id, id))
      if (!category) {
        throw new NotFoundException('Category not found')
      }
      const [{ value }] = await tx.select({ value: count() }).from(transactions).where(eq(transactions.categoryId, id))
      return { transactionCount: value }
    })
  }

  /**
   * Hard delete: clears the category from every transaction that had it
   * (they become Uncategorized), then deletes the category itself — unlike
   * archive(), nothing keeps it.
   */
  async remove(userId: string, id: string): Promise<{ id: string; clearedTransactionCount: number }> {
    return runInTenantContext(this.db, userId, async (tx) => {
      try {
        const cleared = await tx
          .update(transactions)
          .set({ categoryId: null, updatedAt: new Date() })
          .where(eq(transactions.categoryId, id))
          .returning({ id: transactions.id })
        const [row] = await tx.delete(categories).where(eq(categories.id, id)).returning({ id: categories.id })
        if (!row) {
          throw new NotFoundException('Category not found')
        }
        return { id: row.id, clearedTransactionCount: cleared.length }
      } catch (error) {
        mapPostgresError(error)
      }
    })
  }
}
