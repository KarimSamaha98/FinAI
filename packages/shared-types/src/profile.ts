import { z } from "zod";
import { CurrencyCodeSchema } from "./currency.js";

export const ProfileSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().nullable(),
  homeCurrencyCode: CurrencyCodeSchema,
  /** ISO 3166-1 alpha-2, chosen at sign-up. */
  countryCode: z.string().regex(/^[A-Z]{2}$/).nullable(),
  /** Short-lived signed URL for the profile photo; null when none was uploaded. */
  avatarUrl: z.string().url().nullable(),
  createdAt: z.string().datetime(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const UpdateProfileInputSchema = z.object({
  displayName: z.string().min(1).max(80).nullable().optional(),
  homeCurrencyCode: CurrencyCodeSchema.optional(),
  countryCode: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInputSchema>;
