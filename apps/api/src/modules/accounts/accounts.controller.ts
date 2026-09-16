import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { CreateAccountInputSchema, UpdateAccountInputSchema } from 'shared-types'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js'
import { CurrentUserId } from '../auth/current-user-id.decorator.js'
import { AccountsService } from './accounts.service.js'

@Controller('accounts')
@UseGuards(SupabaseAuthGuard)
export class AccountsController {
  constructor(@Inject(AccountsService) private readonly accountsService: AccountsService) {}

  @Get()
  list(@CurrentUserId() userId: string, @Query('includeArchived') includeArchived?: string) {
    return this.accountsService.list(userId, { includeArchived: includeArchived === 'true' })
  }

  @Get(':id')
  getById(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.accountsService.getById(userId, id)
  }

  @Post()
  create(@CurrentUserId() userId: string, @Body() body: unknown) {
    const input = CreateAccountInputSchema.parse(body)
    return this.accountsService.create(userId, input)
  }

  @Patch(':id')
  update(@CurrentUserId() userId: string, @Param('id') id: string, @Body() body: unknown) {
    const { id: _id, ...input } = UpdateAccountInputSchema.parse({ ...(body as object), id })
    return this.accountsService.update(userId, id, input)
  }

  @Delete(':id')
  delete(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.accountsService.delete(userId, id)
  }
}
