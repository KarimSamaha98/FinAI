import { BadRequestException, Controller, Get, Inject, Query, UseGuards } from '@nestjs/common'
import { format } from 'date-fns'
import type { InsightMode } from 'shared-types'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js'
import { CurrentUserId } from '../auth/current-user-id.decorator.js'
import { ChartAggregationService } from './chart-aggregation.service.js'

function parseMode(raw: string | undefined): InsightMode {
  return raw === 'yearly' ? 'yearly' : 'monthly'
}

function parsePeriod(mode: InsightMode, raw: string | undefined): string {
  if (mode === 'yearly') {
    const value = raw ?? format(new Date(), 'yyyy')
    if (!/^\d{4}$/.test(value)) throw new BadRequestException('period must be YYYY for yearly mode')
    return value
  }
  const value = raw ?? format(new Date(), 'yyyy-MM')
  if (!/^\d{4}-\d{2}$/.test(value)) throw new BadRequestException('period must be YYYY-MM for monthly mode')
  return value
}

@Controller('reporting')
@UseGuards(SupabaseAuthGuard)
export class ReportingController {
  constructor(@Inject(ChartAggregationService) private readonly chartAggregationService: ChartAggregationService) {}

  @Get('category-breakdown')
  categoryBreakdown(
    @CurrentUserId() userId: string,
    @Query('type') type: string | undefined,
    @Query('mode') modeRaw?: string,
    @Query('period') periodRaw?: string,
  ) {
    const mode = parseMode(modeRaw)
    const period = parsePeriod(mode, periodRaw)
    return this.chartAggregationService.getCategoryBreakdown(userId, mode, period, 'real', type === 'income' ? 'income' : 'expense')
  }

  @Get('timeseries')
  timeseries(
    @CurrentUserId() userId: string,
    @Query('type') type: string | undefined,
    @Query('mode') modeRaw?: string,
    @Query('period') periodRaw?: string,
  ) {
    const mode = parseMode(modeRaw)
    const period = parsePeriod(mode, periodRaw)
    return this.chartAggregationService.getTimeseries(userId, mode, period, 'real', type === 'income' ? 'income' : 'expense')
  }

  @Get('summary')
  summary(
    @CurrentUserId() userId: string,
    @Query('mode') modeRaw?: string,
    @Query('period') periodRaw?: string,
  ) {
    const mode = parseMode(modeRaw)
    const period = parsePeriod(mode, periodRaw)
    return this.chartAggregationService.getDashboardSummary(userId, mode, period, 'real')
  }

  @Get('heatmap')
  heatmap(
    @CurrentUserId() userId: string,
    @Query('type') type: string | undefined,
    @Query('mode') modeRaw?: string,
    @Query('period') periodRaw?: string,
  ) {
    const mode = parseMode(modeRaw)
    const period = parsePeriod(mode, periodRaw)
    return this.chartAggregationService.getHeatmap(userId, mode, period, 'real', type === 'income' ? 'income' : 'expense')
  }

  @Get('important-things')
  importantThings(
    @CurrentUserId() userId: string,
    @Query('mode') modeRaw?: string,
    @Query('period') periodRaw?: string,
  ) {
    const mode = parseMode(modeRaw)
    const period = parsePeriod(mode, periodRaw)
    return this.chartAggregationService.getImportantThings(userId, mode, period, 'real')
  }

  @Get('trend')
  trend(
    @CurrentUserId() userId: string,
    @Query('mode') modeRaw?: string,
    @Query('period') periodRaw?: string,
  ) {
    const mode = parseMode(modeRaw)
    const period = parsePeriod(mode, periodRaw)
    return this.chartAggregationService.getTrend(userId, mode, period, 'real')
  }
}
