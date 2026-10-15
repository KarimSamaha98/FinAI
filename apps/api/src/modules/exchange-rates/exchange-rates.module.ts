import { Global, Module } from '@nestjs/common'
import { FrankfurterProvider } from './frankfurter.provider.js'
import { FX_RATE_PROVIDER } from './fx-rate-provider.js'
import { ExchangeRatesService } from './exchange-rates.service.js'

/**
 * Global so every service that materializes or consumes home-currency values
 * (transactions, imports, accounts, reporting) can inject ExchangeRatesService
 * without the DbModule-style import bookkeeping.
 */
@Global()
@Module({
  providers: [{ provide: FX_RATE_PROVIDER, useFactory: () => new FrankfurterProvider() }, ExchangeRatesService],
  exports: [ExchangeRatesService],
})
export class ExchangeRatesModule {}
