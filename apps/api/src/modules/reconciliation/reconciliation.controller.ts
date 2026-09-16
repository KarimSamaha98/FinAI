import { Body, Controller, Delete, Get, Inject, Param, Post, UseGuards } from '@nestjs/common'
import { CreateReconciliationGroupInputSchema, AddReconciliationMemberInputSchema } from 'shared-types'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js'
import { CurrentUserId } from '../auth/current-user-id.decorator.js'
import { ReconciliationService } from './reconciliation.service.js'

@Controller('reconciliation-groups')
@UseGuards(SupabaseAuthGuard)
export class ReconciliationController {
  constructor(@Inject(ReconciliationService) private readonly reconciliationService: ReconciliationService) {}

  @Get()
  list(@CurrentUserId() userId: string) {
    return this.reconciliationService.list(userId)
  }

  @Post()
  create(@CurrentUserId() userId: string, @Body() body: unknown) {
    const input = CreateReconciliationGroupInputSchema.parse(body)
    return this.reconciliationService.create(userId, input.label, input.transactionIds)
  }

  @Post(':id/members')
  addMember(@CurrentUserId() userId: string, @Param('id') id: string, @Body() body: unknown) {
    const input = AddReconciliationMemberInputSchema.parse({ ...(body as object), groupId: id })
    return this.reconciliationService.addMember(userId, id, input.transactionId)
  }

  @Delete(':id/members/:transactionId')
  removeMember(@CurrentUserId() userId: string, @Param('id') id: string, @Param('transactionId') transactionId: string) {
    return this.reconciliationService.removeMember(userId, id, transactionId)
  }

  @Delete(':id')
  delete(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.reconciliationService.delete(userId, id)
  }
}
