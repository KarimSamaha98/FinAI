import { HttpException, HttpStatus } from '@nestjs/common'

/**
 * Thrown when a required exchange rate can't be resolved (the provider was
 * unreachable and nothing is cached). Rate-dependent endpoints let it
 * propagate as a 503 so the UI can show a "could not load your data" state
 * instead of silently dropping amounts.
 */
export class FxUnavailableError extends HttpException {
  constructor(message: string) {
    super({ statusCode: HttpStatus.SERVICE_UNAVAILABLE, code: 'FX_UNAVAILABLE', message }, HttpStatus.SERVICE_UNAVAILABLE)
  }

  static pair(base: string, quote: string, date: string): FxUnavailableError {
    return new FxUnavailableError(`Exchange rate unavailable for ${base}→${quote} on ${date}`)
  }

  static amount(currencyCode: string, date: string): FxUnavailableError {
    return new FxUnavailableError(`Exchange rate unavailable for ${currencyCode} on ${date}`)
  }
}
