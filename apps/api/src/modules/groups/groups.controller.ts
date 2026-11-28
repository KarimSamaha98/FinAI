import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { SaveGroupInputSchema, SaveTransferInputSchema } from 'shared-types'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js'
import { CurrentUserId } from '../auth/current-user-id.decorator.js'
import { GroupsService } from './groups.service.js'

@Controller('groups')
@UseGuards(SupabaseAuthGuard)
export class GroupsController {
  constructor(@Inject(GroupsService) private readonly groups: GroupsService) {}

  @Get()
  list(@CurrentUserId() userId: string) {
    return this.groups.list(userId)
  }

  /** Transactions that can go in a group (?currency=, ?group= to count that group's own as free). */
  @Get('candidates')
  candidates(@CurrentUserId() userId: string, @Query('currency') currencyCode?: string, @Query('group') groupId?: string) {
    return this.groups.candidates(userId, { currencyCode: currencyCode || undefined, groupId: groupId || undefined })
  }

  /** What could be the other side of a transfer with ?transaction=, likely ones first. */
  @Get('transfer-candidates')
  transferCandidates(@CurrentUserId() userId: string, @Query('transaction') transactionId: string) {
    return this.groups.transferCandidates(userId, transactionId)
  }

  /** Matches transactions as a transfer between the user's accounts. Undo it with DELETE /groups/:id. */
  @Post('transfers')
  createTransfer(@CurrentUserId() userId: string, @Body() body: unknown) {
    return this.groups.saveTransfer(userId, SaveTransferInputSchema.parse(body))
  }

  @Get(':id')
  get(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.groups.get(userId, id)
  }

  @Post()
  create(@CurrentUserId() userId: string, @Body() body: unknown) {
    return this.groups.save(userId, null, SaveGroupInputSchema.parse(body))
  }

  /** Replaces what's in the group. Fewer than two things left ungroups it (returns null). */
  @Put(':id')
  update(@CurrentUserId() userId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.groups.save(userId, id, SaveGroupInputSchema.parse(body))
  }

  @Delete(':id')
  delete(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.groups.delete(userId, id)
  }
}
