import { z } from "zod";
import { CurrencyCodeSchema } from "./currency.js";

/**
 * People: one running balance with each person the user shares money with.
 *
 * The user tags transactions with people; each tag is an entry that moves the
 * person's balance. Nothing links a repayment to what it repays: the balance
 * is just the sum. Entry amounts are signed: positive = the person owes the
 * user more, negative = the user owes them more (or they paid some back).
 *
 * - share: a person's portion of a tagged transaction, = −(their portion of
 *   the transaction amount). A −120 dinner split with Sam at 60 → +60; Sam's
 *   +60 transfer tagged to Sam → −60. Lending is a split with the user's
 *   share at 0; borrowing is an incoming transfer tagged to the lender.
 *   Settling up with a transaction (an existing one, or a new one) is a share
 *   too: the whole transaction goes to the person.
 * - writeoff: settling up by forgiving what's left, booked as an
 *   account-less adjustment transaction of the same amount.
 */

export const SplitModeSchema = z.enum(["equal", "amount", "percent"]);
export type SplitMode = z.infer<typeof SplitModeSchema>;

export const PersonEntryKindSchema = z.enum(["share", "writeoff"]);
export type PersonEntryKind = z.infer<typeof PersonEntryKindSchema>;

// ── Contacts ───────────────────────────────────────────────────────────────

export const ContactSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  createdAt: z.string().datetime(),
});
export type Contact = z.infer<typeof ContactSchema>;

export const CreateContactInputSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
});
export type CreateContactInput = z.infer<typeof CreateContactInputSchema>;

export const UpdateContactInputSchema = CreateContactInputSchema;
export type UpdateContactInput = z.infer<typeof UpdateContactInputSchema>;

// ── Balances ───────────────────────────────────────────────────────────────

export const PersonBalanceSchema = z.object({
  currencyCode: CurrencyCodeSchema,
  /** Signed: positive = they owe the user, negative = the user owes them. */
  amount: z.number(),
});
export type PersonBalance = z.infer<typeof PersonBalanceSchema>;

export const PersonSummarySchema = z.object({
  contact: ContactSchema,
  homeCurrencyCode: CurrencyCodeSchema,
  /** All balances converted at today's rate and netted. Signed like an entry. */
  net: z.number(),
  /** Non-zero balances per currency. */
  balances: z.array(PersonBalanceSchema),
});
export type PersonSummary = z.infer<typeof PersonSummarySchema>;

export const PeopleSummarySchema = z.object({
  homeCurrencyCode: CurrencyCodeSchema,
  /** People with an open balance, largest first. */
  people: z.array(PersonSummarySchema),
});
export type PeopleSummary = z.infer<typeof PeopleSummarySchema>;

export const PersonEntrySchema = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid(),
  kind: PersonEntryKindSchema,
  transactionId: z.string().uuid().nullable(),
  /** Signed like the balance. */
  amount: z.number(),
  currencyCode: CurrencyCodeSchema,
  date: z.string().date(),
  /** The transaction's description ("Settled up" for a write-off). */
  label: z.string(),
});
export type PersonEntry = z.infer<typeof PersonEntrySchema>;

export const PersonDetailSchema = z.object({
  summary: PersonSummarySchema,
  /** Newest first. */
  entries: z.array(PersonEntrySchema),
});
export type PersonDetail = z.infer<typeof PersonDetailSchema>;

// ── Splits (tagging a transaction with people) ─────────────────────────────

export const SplitParticipantInputSchema = z.object({
  contactId: z.string().uuid(),
  /** amount mode: the amount · percent: the percentage · equal: ignored. */
  value: z.number().min(0),
});
export type SplitParticipantInput = z.infer<typeof SplitParticipantInputSchema>;

export const TransactionSplitInputSchema = z.object({
  mode: SplitModeSchema,
  /**
   * Equal mode: 1 (include me) or 0 (all theirs). Amount and percent give the
   * user whatever the others don't take.
   */
  myValue: z.number().min(0).default(1),
  participants: z.array(SplitParticipantInputSchema).min(1).max(30),
});
export type TransactionSplitInput = z.infer<typeof TransactionSplitInputSchema>;

export const TransactionSplitSchema = z.object({
  id: z.string().uuid(),
  transactionId: z.string().uuid(),
  mode: SplitModeSchema,
  myValue: z.number(),
  /** The user's portion, as a magnitude. */
  myShare: z.number(),
  participants: z.array(
    z.object({
      contactId: z.string().uuid(),
      value: z.number(),
      /** Their portion, as a magnitude. */
      amount: z.number(),
    }),
  ),
});
export type TransactionSplit = z.infer<typeof TransactionSplitSchema>;

export const TransactionPeopleSchema = z.object({
  transactionId: z.string().uuid(),
  split: TransactionSplitSchema.nullable(),
});
export type TransactionPeople = z.infer<typeof TransactionPeopleSchema>;

// ── Settle up ──────────────────────────────────────────────────────────────

/**
 * - forgive: write off what's left (every currency) as an account-less
 *   adjustment: spending when they owed the user, income when the user owed them.
 * - link: an existing transaction (their transfer in, or the user's payment
 *   out) goes entirely to the person.
 * - new: record a new transaction on an account for `amount`, and give it
 *   entirely to the person. Money in when they owe the user, out otherwise.
 */
export const SettleUpInputSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("forgive") }),
  z.object({ method: z.literal("link"), transactionId: z.string().uuid() }),
  z.object({
    method: z.literal("new"),
    accountId: z.string().uuid(),
    amount: z.number().positive(),
    date: z.string().date(),
    description: z.string().trim().min(1).max(200),
  }),
]);
export type SettleUpInput = z.infer<typeof SettleUpInputSchema>;

/** A transaction that could settle up with a person (right direction, not already linked to anything). */
export const SettleUpCandidateSchema = z.object({
  id: z.string().uuid(),
  date: z.string().date(),
  description: z.string(),
  amount: z.number(),
  currencyCode: CurrencyCodeSchema,
  accountName: z.string().nullable(),
});
export type SettleUpCandidate = z.infer<typeof SettleUpCandidateSchema>;

// ── Calculations shared by the web preview and the API ─────────────────────

const toCents = (amount: number) => Math.round(amount * 100);
const fromCents = (cents: number) => cents / 100;

export interface SplitComputation {
  /** The user's portion (what the others don't take). */
  myShare: number;
  /** Each participant's portion, in input order. */
  shares: number[];
  /** null when the split is usable; otherwise why not. */
  problem: null | "over_total" | "zero_share" | "percent_over_100" | "no_shares";
}

/**
 * Divides `total` (a magnitude) between the user and `participants`, to the
 * cent. Everyone else's portion is truncated to the cent and the user absorbs
 * the leftover cents — unless the user takes no part (weight 0, or
 * percentages adding to 100), in which case the leftover cents go to the
 * participants one by one. Typed amounts are used as entered.
 * - equal: each participant weighs 1, the user `myValue` (1 or 0).
 * - amount: participants' values are amounts; the user gets what's left.
 * - percent: participants' values are percentages; the user gets the rest.
 */
export function computeSplit(total: number, mode: SplitMode, participants: number[], options: { myValue?: number } = {}): SplitComputation {
  const totalCents = toCents(Math.abs(total));
  const myValue = options.myValue ?? 1;
  let shareCents: number[];
  let problem: SplitComputation["problem"] = null;
  let userTakesNothing = false;

  if (mode === "amount") {
    shareCents = participants.map((value) => toCents(value));
  } else if (mode === "percent") {
    const percentTotal = participants.reduce((sum, value) => sum + value, 0);
    if (percentTotal > 100 + 1e-9) problem = "percent_over_100";
    userTakesNothing = Math.abs(percentTotal - 100) < 1e-9;
    shareCents = participants.map((value) => Math.floor((totalCents * value) / 100));
  } else {
    const weights = participants.map(() => 1);
    const myWeight = myValue > 0 ? 1 : 0;
    const weightTotal = weights.length + myWeight;
    if (weightTotal <= 0) {
      return { myShare: fromCents(totalCents), shares: participants.map(() => 0), problem: "no_shares" };
    }
    userTakesNothing = myWeight === 0;
    shareCents = weights.map((w) => Math.floor((totalCents * w) / weightTotal));
  }

  if (userTakesNothing && !problem) {
    // Hand the leftover cents to the participants who have a share.
    let leftover = totalCents - shareCents.reduce((sum, c) => sum + c, 0);
    for (let i = 0; leftover > 0 && i < shareCents.length * 2; i++) {
      const index = i % shareCents.length;
      if (shareCents[index] > 0 || participants[index] > 0 || mode === "equal") {
        shareCents[index] += 1;
        leftover -= 1;
      }
    }
  }

  const othersCents = shareCents.reduce((sum, c) => sum + c, 0);
  const myCents = totalCents - othersCents;
  if (!problem && myCents < 0) problem = "over_total";
  if (!problem && shareCents.some((c) => c <= 0)) problem = "zero_share";
  return { myShare: fromCents(myCents), shares: shareCents.map(fromCents), problem };
}

/**
 * The signed entry amount for a person's portion of a transaction: the
 * opposite sign of the transaction. An expense (−) split → they owe (+);
 * money in (+) from them → they owe less (−).
 */
export function shareEntryAmount(transactionAmount: number, portion: number): number {
  const cents = toCents(Math.abs(portion));
  return fromCents(transactionAmount < 0 ? cents : -cents);
}
