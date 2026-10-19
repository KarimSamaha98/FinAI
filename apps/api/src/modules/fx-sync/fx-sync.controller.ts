import { BadRequestException, Controller, Get, Inject, Post, Query, UseGuards } from '@nestjs/common'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js'
import { CurrentUserId } from '../auth/current-user-id.decorator.js'
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service.js'
import { FxSyncService } from './fx-sync.service.js'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const CURRENCY = /^[A-Za-z]{3}$/

@Controller('fx')
@UseGuards(SupabaseAuthGuard)
export class FxSyncController {
  constructor(
    @Inject(FxSyncService) private readonly fxSyncService: FxSyncService,
    @Inject(ExchangeRatesService) private readonly exchangeRates: ExchangeRatesService,
  ) {}

  /** Warm rates for the user's currencies and repair any failed conversions. Called on login. */
  @Post('sync')
  sync(@CurrentUserId() userId: string) {
    return this.fxSyncService.sync(userId)
  }

  /**
   * The market rate base→quote on a date (nearest earlier published day), used
   * by the transaction edit form to show the auto rate before saving. 503
   * FX_UNAVAILABLE when none can be resolved (the client shows "N/A").
   */
  @Get('rate')
  async rate(@Query('base') base?: string, @Query('quote') quote?: string, @Query('date') date?: string) {
    if (!base || !quote || !date || !CURRENCY.test(base) || !CURRENCY.test(quote) || !ISO_DATE.test(date)) {
      throw new BadRequestException('base, quote (ISO 4217) and date (yyyy-MM-dd) are required')
    }
    const rate = await this.exchangeRates.requireRate(base.toUpperCase(), quote.toUpperCase(), date)
    return { rate }
  }
}
