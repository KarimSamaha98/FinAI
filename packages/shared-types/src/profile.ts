import { z } from "zod";
import { CurrencyCodeSchema } from "./currency.js";

export const ProfileSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().nullable(),
  homeCurrencyCode: CurrencyCodeSchema,
  createdAt: z.string().datetime(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const UpdateProfileInputSchema = z.object({
  displayName: z.string().min(1).max(80).nullable().optional(),
  homeCurrencyCode: CurrencyCodeSchema.optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInputSchema>;
