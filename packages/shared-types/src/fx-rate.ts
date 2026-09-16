import { z } from "zod";
import { CurrencyCodeSchema } from "./currency.js";

export const FxRateSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  baseCurrency: CurrencyCodeSchema,
  quoteCurrency: CurrencyCodeSchema,
  rate: z.number().positive(),
  updatedAt: z.string().datetime(),
});
export type FxRate = z.infer<typeof FxRateSchema>;

export const UpsertFxRateInputSchema = FxRateSchema.pick({
  baseCurrency: true,
  quoteCurrency: true,
  rate: true,
});
export type UpsertFxRateInput = z.infer<typeof UpsertFxRateInputSchema>;
