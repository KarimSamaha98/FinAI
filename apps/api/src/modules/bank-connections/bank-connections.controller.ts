import { Body, BadRequestException, Controller, Patch, Post, Get, Inject, Param, Query, UseGuards } from '@nestjs/common'
import { ZodError, ZodSchema } from 'zod'
import { CreateBankConnectionInputSchema } from 'shared-types'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js'
import { CurrentUserId } from '../auth/current-user-id.decorator.js'
import { BankConnectionsService } from './bank-connections.service.js'

/** This endpoint takes a pasted free-text URL, so bad bodies get a 400 with the field errors rather than the repo's default 500-on-ZodError. */
function parseOr400<T extends ZodSchema>(schema: T, body: unknown): ReturnType<T['parse']> {
  try {
    return schema.parse(body)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new BadRequestException(error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '))
    }
    throw error
  }
}

@Controller('bank-connections')
@UseGuards(SupabaseAuthGuard)
export class BankConnectionsController {
  constructor(@Inject(BankConnectionsService) private readonly bankConnectionsService: BankConnectionsService) {}

  @Get()
  list(@CurrentUserId() userId: string, @Query('accountId') accountId?: string) {
    return this.bankConnectionsService.list(userId, { accountId })
  }

  @Post()
  create(@CurrentUserId() userId: string, @Body() body: unknown) {
    const input = parseOr400(CreateBankConnectionInputSchema, body)
    return this.bankConnectionsService.create(userId, input)
  }

  /** Extension calls this after a captured CSV finishes uploading successfully. */
  @Post(':id/synced')
  markSynced(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.bankConnectionsService.markSynced(userId, id)
  }

  /** Marks the connection disconnected (until the user reconnects it). */
  @Patch(':id/disconnect')
  disconnect(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.bankConnectionsService.disconnect(userId, id)
  }
}
