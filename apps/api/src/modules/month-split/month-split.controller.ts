import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { CreateMonthSplitInputSchema, UpdateMonthSplitInputSchema } from 'shared-types'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js'
import { CurrentUserId } from '../auth/current-user-id.decorator.js'
import { MonthSplitService } from './month-split.service.js'

@Controller('month-splits')
@UseGuards(SupabaseAuthGuard)
export class MonthSplitController {
  constructor(@Inject(MonthSplitService) private readonly monthSplitService: MonthSplitService) {}

  @Get()
  list(@CurrentUserId() userId: string) {
    return this.monthSplitService.list(userId)
  }

  @Post()
  create(@CurrentUserId() userId: string, @Body() body: unknown) {
    const input = CreateMonthSplitInputSchema.parse(body)
    return this.monthSplitService.create(userId, input.transactionId, input.startMonth, input.numMonths)
  }

  @Patch(':id')
  update(@CurrentUserId() userId: string, @Param('id') id: string, @Body() body: unknown) {
    const input = UpdateMonthSplitInputSchema.parse({ ...(body as object), id })
    return this.monthSplitService.update(userId, id, input.startMonth, input.numMonths)
  }

  @Delete(':id')
  delete(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.monthSplitService.delete(userId, id)
  }
}
