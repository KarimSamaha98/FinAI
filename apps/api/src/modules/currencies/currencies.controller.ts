import { Controller, Get, Inject } from '@nestjs/common'
import { CurrenciesService } from './currencies.service.js'

/**
 * Public: the currency list is reference data and is needed on the sign-up
 * screen (before the user has a session), so it is not auth-guarded.
 */
@Controller('currencies')
export class CurrenciesController {
  constructor(@Inject(CurrenciesService) private readonly currenciesService: CurrenciesService) {}

  @Get()
  list() {
    return this.currenciesService.list()
  }
}
