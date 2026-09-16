import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common'
import { UpsertFxRateInputSchema } from 'shared-types'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js'
import { CurrentUserId } from '../auth/current-user-id.decorator.js'
import { FxRatesService } from './fx-rates.service.js'

@Controller('fx-rates')
@UseGuards(SupabaseAuthGuard)
export class FxRatesController {
  constructor(@Inject(FxRatesService) private readonly fxRatesService: FxRatesService) {}

  @Get()
  list(@CurrentUserId() userId: string) {
    return this.fxRatesService.list(userId)
  }

  @Get('currencies-in-use')
  currenciesInUse(@CurrentUserId() userId: string) {
    return this.fxRatesService.currenciesInUse(userId)
  }

  @Post()
  upsert(@CurrentUserId() userId: string, @Body() body: unknown) {
    const input = UpsertFxRateInputSchema.parse(body)
    return this.fxRatesService.upsert(userId, input)
  }
}
