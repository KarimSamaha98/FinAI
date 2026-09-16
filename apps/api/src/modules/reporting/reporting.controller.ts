import { BadRequestException, Controller, Get, Inject, Query, UseGuards } from '@nestjs/common'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js'
import { CurrentUserId } from '../auth/current-user-id.decorator.js'
import { ChartAggregationService } from './chart-aggregation.service.js'
import type { ListTransactionsFilter } from './reporting-query.service.js'

function parseFilter(
  from: string | undefined,
  to: string | undefined,
  categoryIds: string | undefined,
  accountIds: string | undefined,
): ListTransactionsFilter {
  if (!from || !to) {
    throw new BadRequestException('from and to are required')
  }
  return {
    dateRange: { from, to },
    categoryIds: categoryIds ? categoryIds.split(',').filter(Boolean) : undefined,
    accountIds: accountIds ? accountIds.split(',').filter(Boolean) : undefined,
  }
}

@Controller('reporting')
@UseGuards(SupabaseAuthGuard)
export class ReportingController {
  constructor(@Inject(ChartAggregationService) private readonly chartAggregationService: ChartAggregationService) {}

  @Get('category-breakdown')
  categoryBreakdown(
    @CurrentUserId() userId: string,
    @Query('type') type: string | undefined,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('categoryIds') categoryIds?: string,
    @Query('accountIds') accountIds?: string,
    @Query('view') view?: string,
  ) {
    return this.chartAggregationService.getCategoryBreakdown(
      userId,
      parseFilter(from, to, categoryIds, accountIds),
      view === 'nominal' ? 'nominal' : 'real',
      type === 'income' ? 'income' : 'expense',
    )
  }

  @Get('timeseries')
  timeseries(
    @CurrentUserId() userId: string,
    @Query('type') type: string | undefined,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('categoryIds') categoryIds?: string,
    @Query('accountIds') accountIds?: string,
    @Query('view') view?: string,
  ) {
    return this.chartAggregationService.getTimeseries(
      userId,
      parseFilter(from, to, categoryIds, accountIds),
      view === 'nominal' ? 'nominal' : 'real',
      type === 'income' ? 'income' : 'expense',
    )
  }

  @Get('summary')
  summary(
    @CurrentUserId() userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('categoryIds') categoryIds?: string,
    @Query('accountIds') accountIds?: string,
    @Query('view') view?: string,
  ) {
    return this.chartAggregationService.getDashboardSummary(
      userId,
      parseFilter(from, to, categoryIds, accountIds),
      view === 'nominal' ? 'nominal' : 'real',
    )
  }
}
