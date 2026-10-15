import { Inject, Injectable } from '@nestjs/common'
import type { Currency } from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { currencies } from '../../db/schema.js'

/**
 * Reads the global currencies reference table (public data; its RLS policy
 * allows everyone to select). Populated from the rate provider by the
 * sync:currencies script.
 */
@Injectable()
export class CurrenciesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(): Promise<Currency[]> {
    const rows = await this.db.select().from(currencies).orderBy(currencies.code)
    return rows.map((row) => ({
      code: row.code,
      name: row.name,
      symbol: row.symbol,
      startDate: row.startDate,
      endDate: row.endDate,
    }))
  }
}
