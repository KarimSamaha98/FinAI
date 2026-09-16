import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { CreateTransactionInputSchema, UpdateTransactionInputSchema } from 'shared-types'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js'
import { CurrentUserId } from '../auth/current-user-id.decorator.js'
import { TransactionsService } from './transactions.service.js'
import { ReportingQueryService } from '../reporting/reporting-query.service.js'

@Controller('transactions')
@UseGuards(SupabaseAuthGuard)
export class TransactionsController {
  constructor(
    @Inject(TransactionsService) private readonly transactionsService: TransactionsService,
    @Inject(ReportingQueryService) private readonly reportingQueryService: ReportingQueryService,
  ) {}

  @Get()
  list(
    @CurrentUserId() userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('categoryIds') categoryIds?: string,
    @Query('accountIds') accountIds?: string,
  ) {
    return this.transactionsService.list(userId, {
      dateRange: from || to ? { from, to } : undefined,
      categoryIds: categoryIds ? categoryIds.split(',').filter(Boolean) : undefined,
      accountIds: accountIds ? accountIds.split(',').filter(Boolean) : undefined,
    })
  }

  @Get('display')
  listDisplayRows(
    @CurrentUserId() userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('categoryIds') categoryIds?: string,
    @Query('accountIds') accountIds?: string,
    @Query('view') view?: string,
  ) {
    return this.reportingQueryService.listDisplayRows(
      userId,
      {
        dateRange: from || to ? { from, to } : undefined,
        categoryIds: categoryIds ? categoryIds.split(',').filter(Boolean) : undefined,
        accountIds: accountIds ? accountIds.split(',').filter(Boolean) : undefined,
      },
      view === 'nominal' ? 'nominal' : 'real',
    )
  }

  @Get(':id')
  getById(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.transactionsService.getById(userId, id)
  }

  @Post()
  create(@CurrentUserId() userId: string, @Body() body: unknown) {
    const input = CreateTransactionInputSchema.parse(body)
    return this.transactionsService.create(userId, input)
  }

  @Patch(':id')
  update(@CurrentUserId() userId: string, @Param('id') id: string, @Body() body: unknown) {
    const input = UpdateTransactionInputSchema.parse({ ...(body as object), id })
    return this.transactionsService.update(userId, id, input)
  }

  @Delete(':id')
  delete(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.transactionsService.delete(userId, id)
  }
}
