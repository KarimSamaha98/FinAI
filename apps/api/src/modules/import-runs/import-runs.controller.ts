import { BadRequestException, Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { CommitImportRunInputSchema, ParseWithProfileInputSchema } from 'shared-types'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js'
import { CurrentUserId } from '../auth/current-user-id.decorator.js'
import { ImportRunsService } from './import-runs.service.js'

@Controller('import-runs')
@UseGuards(SupabaseAuthGuard)
export class ImportRunsController {
  constructor(@Inject(ImportRunsService) private readonly importRunsService: ImportRunsService) {}

  @Post('upload')
  async upload(@CurrentUserId() userId: string, @Req() req: FastifyRequest) {
    const file = await req.file()
    if (!file) {
      throw new BadRequestException('No file was uploaded')
    }
    const buffer = await file.toBuffer()
    return this.importRunsService.uploadFile(userId, {
      buffer,
      filename: file.filename,
      mimetype: file.mimetype,
    })
  }

  @Post('parse')
  parse(@CurrentUserId() userId: string, @Body() body: unknown) {
    const input = ParseWithProfileInputSchema.parse(body)
    return this.importRunsService.parseWithProfile(userId, input.uploadedFileId, input.importProfileId)
  }

  @Post('commit')
  commit(@CurrentUserId() userId: string, @Body() body: unknown) {
    const input = CommitImportRunInputSchema.parse(body)
    return this.importRunsService.commit(userId, input)
  }
}
