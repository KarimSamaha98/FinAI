import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { CreateImportProfileInputSchema, PreviewRawRowsInputSchema, UpdateImportProfileInputSchema } from 'shared-types'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js'
import { CurrentUserId } from '../auth/current-user-id.decorator.js'
import { ImportProfilesService } from './import-profiles.service.js'

@Controller('import-profiles')
@UseGuards(SupabaseAuthGuard)
export class ImportProfilesController {
  constructor(@Inject(ImportProfilesService) private readonly importProfilesService: ImportProfilesService) {}

  @Get()
  list(@CurrentUserId() userId: string, @Query('accountId') accountId?: string) {
    return this.importProfilesService.list(userId, { accountId })
  }

  @Post()
  create(@CurrentUserId() userId: string, @Body() body: unknown) {
    const input = CreateImportProfileInputSchema.parse(body)
    return this.importProfilesService.create(userId, input)
  }

  @Patch(':id')
  update(@CurrentUserId() userId: string, @Param('id') id: string, @Body() body: unknown) {
    const { id: _id, ...input } = UpdateImportProfileInputSchema.parse({ ...(body as object), id })
    return this.importProfilesService.update(userId, id, input)
  }

  @Delete(':id')
  delete(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.importProfilesService.delete(userId, id)
  }

  @Post('preview-raw-rows')
  previewRawRows(@CurrentUserId() userId: string, @Body() body: unknown) {
    const input = PreviewRawRowsInputSchema.parse(body)
    return this.importProfilesService.previewRawRows(userId, input.uploadedFileId, input.delimiter, input.hasHeader, input.rowLimit)
  }
}
