import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { CreateImportProfileInput, ImportProfile, PreviewRawRowsResult, UpdateImportProfileInput } from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { importProfiles, importRuns, uploadedFiles } from '../../db/schema.js'
import { StorageService } from '../../storage/storage.module.js'
import { mapPostgresError } from '../../common/postgres-error.js'
import { parseRawRows } from '../import-runs/file-parsing.js'

function toImportProfile(row: typeof importProfiles.$inferSelect): ImportProfile {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    name: row.name,
    hasHeader: row.hasHeader,
    delimiter: row.delimiter,
    columnMapping: row.columnMapping,
    dateFormat: row.dateFormat,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

@Injectable()
export class ImportProfilesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async list(userId: string, filter?: { accountId?: string }): Promise<ImportProfile[]> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const rows = await tx
        .select()
        .from(importProfiles)
        .where(filter?.accountId ? eq(importProfiles.accountId, filter.accountId) : undefined)
        .orderBy(importProfiles.name)
      return rows.map(toImportProfile)
    })
  }

  async create(userId: string, input: CreateImportProfileInput): Promise<ImportProfile> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [existing] = await tx
        .select({ id: importProfiles.id })
        .from(importProfiles)
        .where(eq(importProfiles.accountId, input.accountId))
        .limit(1)
      if (existing) {
        throw new ConflictException('This account already has an import profile — edit it instead')
      }
      try {
        const [row] = await tx.insert(importProfiles).values({ ...input, userId }).returning()
        return toImportProfile(row)
      } catch (error) {
        mapPostgresError(error)
      }
    })
  }

  async update(userId: string, id: string, input: Omit<UpdateImportProfileInput, 'id'>): Promise<ImportProfile> {
    return runInTenantContext(this.db, userId, async (tx) => {
      try {
        const [row] = await tx
          .update(importProfiles)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(importProfiles.id, id))
          .returning()
        if (!row) throw new NotFoundException('Import profile not found')
        return toImportProfile(row)
      } catch (error) {
        mapPostgresError(error)
      }
    })
  }

  async delete(userId: string, id: string): Promise<void> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [usedByCommittedRun] = await tx
        .select({ id: importRuns.id })
        .from(importRuns)
        .where(and(eq(importRuns.importProfileId, id), eq(importRuns.status, 'committed')))
        .limit(1)
      if (usedByCommittedRun) {
        throw new ConflictException('Import profile has committed import runs and cannot be deleted')
      }

      const [row] = await tx.delete(importProfiles).where(eq(importProfiles.id, id)).returning()
      if (!row) throw new NotFoundException('Import profile not found')
    })
  }

  async previewRawRows(
    userId: string,
    uploadedFileId: string,
    delimiter: string,
    hasHeader: boolean,
    rowLimit: number,
  ): Promise<PreviewRawRowsResult> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [file] = await tx.select().from(uploadedFiles).where(eq(uploadedFiles.id, uploadedFileId))
      if (!file) throw new NotFoundException('Uploaded file not found')

      const buffer = await this.storage.download(file.storagePath)
      const rawRows = parseRawRows(buffer, file.originalFilename, delimiter)
      const headerRow = hasHeader ? (rawRows[0] ?? null) : null
      const dataRows = hasHeader ? rawRows.slice(1) : rawRows

      return { headerRow, sampleRows: dataRows.slice(0, rowLimit) }
    })
  }
}
