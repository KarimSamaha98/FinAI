import { z } from "zod";

export const CurrencyCodeSchema = z.string().length(3).toUpperCase();
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;

/**
 * A currency the app supports — sourced from the rate provider (via the
 * currencies table). `symbol` is null for currencies that publish none;
 * `startDate`/`endDate` bound the currency's valid period.
 */
export const CurrencySchema = z.object({
  code: CurrencyCodeSchema,
  name: z.string(),
  symbol: z.string().nullable(),
  startDate: z.string().date().nullable(),
  endDate: z.string().date().nullable(),
});
export type Currency = z.infer<typeof CurrencySchema>;
