import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { and, eq, gte, lte } from 'drizzle-orm'
import type { CommitImportRunInput, CommitImportRunResult, ParseWithProfileResult } from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { importProfiles, importRuns, transactions, uploadedFiles } from '../../db/schema.js'
import { StorageService } from '../../storage/storage.module.js'
import { mapPostgresError } from '../../common/postgres-error.js'
import { parseRawRows } from './file-parsing.js'
import { parseRow, RowParseError, type ParsedRow } from './column-mapping.js'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const MAX_ROWS = 10_000

export interface UploadFileInput {
  buffer: Buffer
  filename: string
  mimetype: string
}

function normalizeDescription(description: string): string {
  return description.trim().toLowerCase()
}

@Injectable()
export class ImportRunsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async uploadFile(userId: string, input: UploadFileInput) {
    if (input.buffer.byteLength > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(`File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB upload limit`)
    }

    const rows = parseRawRows(input.buffer, input.filename, ',')
    if (rows.length > MAX_ROWS) {
      throw new BadRequestException(`File has ${rows.length} rows, exceeding the ${MAX_ROWS} row limit`)
    }

    const id = randomUUID()
    const storagePath = `${userId}/${id}-${input.filename}`
    await this.storage.upload(storagePath, input.buffer, input.mimetype)

    return runInTenantContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .insert(uploadedFiles)
        .values({ id, userId, storagePath, originalFilename: input.filename, rowCount: rows.length })
        .returning()
      return {
        id: row.id,
        userId: row.userId,
        storagePath: row.storagePath,
        originalFilename: row.originalFilename,
        rowCount: row.rowCount,
        uploadedAt: row.uploadedAt.toISOString(),
      }
    })
  }

  /**
   * Re-parses the source file from Storage on every call (preview/parse AND
   * commit) rather than trusting persisted or client-supplied row data — the
   * only state we keep is the profile + uploaded file, matching M1's design
   * decision not to persist staged/parsed rows. Takes an already-open `tx`
   * so callers control the transaction boundary (commit() needs the reads
   * here and its writes in the same atomic transaction).
   */
  private async reparseFile(tx: Db, uploadedFileId: string, importProfileId: string) {
    const [file] = await tx.select().from(uploadedFiles).where(eq(uploadedFiles.id, uploadedFileId))
    if (!file) throw new NotFoundException('Uploaded file not found')

    const [profile] = await tx.select().from(importProfiles).where(eq(importProfiles.id, importProfileId))
    if (!profile) throw new NotFoundException('Import profile not found')

    const buffer = await this.storage.download(file.storagePath)
    const rawRows = parseRawRows(buffer, file.originalFilename, profile.delimiter)
    const headerRow = profile.hasHeader ? rawRows[0] : null
    const dataRows = profile.hasHeader ? rawRows.slice(1) : rawRows

    const parsedByIndex = new Map<number, ParsedRow>()
    dataRows.forEach((row, rowIndex) => {
      let parsed: ParsedRow | null
      try {
        parsed = parseRow(row, rowIndex, headerRow, profile.columnMapping, profile.dateFormat)
      } catch (error) {
        if (error instanceof RowParseError) {
          throw new BadRequestException(`Row ${error.rowIndex + 1}: ${error.message}`)
        }
        throw error
      }
      if (parsed) parsedByIndex.set(rowIndex, parsed)
    })

    return { file, profile, parsedByIndex }
  }

  async parseWithProfile(userId: string, uploadedFileId: string, importProfileId: string): Promise<ParseWithProfileResult> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const { profile, parsedByIndex } = await this.reparseFile(tx, uploadedFileId, importProfileId)
      const parsedRows = [...parsedByIndex.entries()]

      let skippedDuplicateCount = 0
      const rows: ParseWithProfileResult['rows'] = []

      if (parsedRows.length > 0) {
        const dates = parsedRows.map(([, row]) => row.date)
        const minDate = dates.reduce((a, b) => (b < a ? b : a))
        const maxDate = dates.reduce((a, b) => (b > a ? b : a))

        const existing = await tx
          .select({
            date: transactions.date,
            amount: transactions.amount,
            description: transactions.description,
            accountId: transactions.accountId,
          })
          .from(transactions)
          .where(and(gte(transactions.date, minDate), lte(transactions.date, maxDate)))

        // Keyed by accountId too — otherwise same-day/same-amount rows in two
        // different accounts (e.g. an "Interest earned" line on both a CIBC
        // Checking and a Wise account) would wrongly collide as duplicates.
        const existingKeys = new Set(
          existing.map((t) => `${t.accountId}|${t.date}|${Number(t.amount)}|${normalizeDescription(t.description)}`),
        )

        for (const [rowIndex, row] of parsedRows) {
          const key = `${profile.accountId}|${row.date}|${row.amount}|${normalizeDescription(row.description)}`
          if (existingKeys.has(key)) {
            skippedDuplicateCount += 1
            continue
          }
          rows.push({ rowIndex, date: row.date, amount: row.amount, currencyCode: row.currencyCode, description: row.description })
        }
      }

      const [run] = await tx
        .insert(importRuns)
        .values({ userId, uploadedFileId, importProfileId, status: 'pending_review' })
        .returning()
      return { importRunId: run.id, rows, skippedDuplicateCount }
    })
  }

  async commit(userId: string, input: CommitImportRunInput): Promise<CommitImportRunResult> {
    return runInTenantContext(this.db, userId, async (tx) => {
      try {
        const [run] = await tx.select().from(importRuns).where(eq(importRuns.id, input.importRunId))
        if (!run) throw new NotFoundException('Import run not found')
        if (run.status !== 'pending_review') {
          throw new ConflictException(`Import run has already been ${run.status}`)
        }

        const { profile, parsedByIndex } = await this.reparseFile(tx, run.uploadedFileId, run.importProfileId)

        const toInsert = input.rows.map(({ rowIndex, categoryId }) => {
          const parsed = parsedByIndex.get(rowIndex)
          if (!parsed) {
            throw new BadRequestException(`Row ${rowIndex} is no longer present in the source file`)
          }
          return {
            userId,
            date: parsed.date,
            amount: String(parsed.amount),
            currencyCode: parsed.currencyCode,
            description: parsed.description,
            categoryId,
            sourceType: 'import' as const,
            accountId: profile.accountId,
            importProfileId: run.importProfileId,
            importRunId: run.id,
          }
        })

        if (toInsert.length > 0) {
          await tx.insert(transactions).values(toInsert)
        }
        await tx.update(importRuns).set({ status: 'committed', committedAt: new Date() }).where(eq(importRuns.id, run.id))

        return { importedCount: toInsert.length }
      } catch (error) {
        mapPostgresError(error)
      }
    })
  }
}
