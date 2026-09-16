import { z } from "zod";

export const CurrencyCodeSchema = z.string().length(3).toUpperCase();
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;

export const CurrencySchema = z.object({
  code: CurrencyCodeSchema,
  name: z.string(),
  symbol: z.string(),
});
export type Currency = z.infer<typeof CurrencySchema>;
