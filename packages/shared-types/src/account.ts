import { z } from "zod";
import { CurrencyCodeSchema } from "./currency.js";
import { ExcludedCurrencySchema } from "./reporting.js";

export const AccountTypeSchema = z.enum(["checking", "credit", "e_banking", "investment", "other"]);
export type AccountType = z.infer<typeof AccountTypeSchema>;

export const AccountSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1).max(80),
  type: AccountTypeSchema,
  institution: z.string().max(80).nullable(),
  currencyCode: CurrencyCodeSchema,
  startingBalance: z.number(),
  balanceAsOf: z.string().date(),
  // Bumped only when startingBalance/balanceAsOf actually change (account
  // creation, or a targeted update) — distinct from updatedAt, which any
  // field edit (rename, currency change, archive) also bumps.
  balanceUpdatedAt: z.string().datetime(),
  isArchived: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Account = z.infer<typeof AccountSchema>;

export const CreateAccountInputSchema = AccountSchema.pick({
  name: true,
  type: true,
  institution: true,
  currencyCode: true,
  startingBalance: true,
  balanceAsOf: true,
});
export type CreateAccountInput = z.infer<typeof CreateAccountInputSchema>;

export const UpdateAccountInputSchema = CreateAccountInputSchema.partial().extend({
  id: z.string().uuid(),
  isArchived: z.boolean().optional(),
});
export type UpdateAccountInput = z.infer<typeof UpdateAccountInputSchema>;

/**
 * All computed on read from the account's transactions (see AccountsService)
 * — never stored. balanceAsOf on the underlying Account is the cutoff: only
 * transactions dated after it contribute to balance, since the
 * starting_balance snapshot already reflects everything up to that date.
 * lastTransactionUpdatedAt is null when the account has no transactions yet;
 * lastBalanceUpdatedAt (= the account's own balanceUpdatedAt) is always set.
 */
export const AccountSummarySchema = AccountSchema.extend({
  balance: z.number(),
  lastTransactionDate: z.string().date().nullable(),
  lastTransactionUpdatedAt: z.string().datetime().nullable(),
  lastBalanceUpdatedAt: z.string().datetime(),
  excludedCurrencies: z.array(ExcludedCurrencySchema),
});
export type AccountSummary = z.infer<typeof AccountSummarySchema>;
