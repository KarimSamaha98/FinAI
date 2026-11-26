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
 * - cash: money that changed hands outside any tracked account.
 * - writeoff: "settle up" — clears what's left, booked as an account-less
 *   adjustment transaction of the same amount.
 */

export const SplitModeSchema = z.enum(["equal", "amount", "percent", "shares"]);
export type SplitMode = z.infer<typeof SplitModeSchema>;

export const PersonEntryKindSchema = z.enum(["share", "cash", "writeoff"]);
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
  lastActivityDate: z.string().date().nullable(),
});
export type PersonSummary = z.infer<typeof PersonSummarySchema>;

export const PeopleSummarySchema = z.object({
  homeCurrencyCode: CurrencyCodeSchema,
  /** Σ of positive nets (people who owe the user), in home currency. */
  owedToMe: z.number(),
  /** Σ of negative nets as a positive number (people the user owes). */
  iOwe: z.number(),
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
  note: z.string().nullable(),
  /** The transaction's description, or a description of the cash entry. */
  label: z.string(),
  /** The tagged transaction's own amount (null for cash). */
  transactionAmount: z.number().nullable(),
  /** The balance in this currency after this entry. */
  balanceAfter: z.number(),
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
  /** amount mode: the amount · percent: the percentage · shares: the share count · equal: ignored. */
  value: z.number().min(0),
});
export type SplitParticipantInput = z.infer<typeof SplitParticipantInputSchema>;

export const TransactionSplitInputSchema = z.object({
  mode: SplitModeSchema,
  /**
   * The user's own weight: equal mode 1 (include me) or 0 (all theirs);
   * shares mode the user's share count. Amount and percent give the user
   * whatever the others don't take.
   */
  myValue: z.number().min(0).default(1),
  participants: z.array(SplitParticipantInputSchema).min(1).max(30),
  note: z.string().max(500).nullable().optional(),
});
export type TransactionSplitInput = z.infer<typeof TransactionSplitInputSchema>;

export const TransactionSplitSchema = z.object({
  id: z.string().uuid(),
  transactionId: z.string().uuid(),
  mode: SplitModeSchema,
  myValue: z.number(),
  /** The user's portion, as a magnitude. */
  myShare: z.number(),
  note: z.string().nullable(),
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

// ── Cash and settle up ─────────────────────────────────────────────────────

export const RecordCashInputSchema = z.object({
  /** they_paid: the person gave the user money · i_paid: the user gave the person money. */
  direction: z.enum(["they_paid", "i_paid"]),
  amount: z.number().positive(),
  currencyCode: CurrencyCodeSchema,
  date: z.string().date(),
  note: z.string().max(500).nullable().optional(),
});
export type RecordCashInput = z.infer<typeof RecordCashInputSchema>;

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
 * - shares: values are share counts; the user's count is `myValue`.
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
    const weights = mode === "equal" ? participants.map(() => 1) : participants;
    const myWeight = mode === "equal" ? (myValue > 0 ? 1 : 0) : myValue;
    const weightTotal = weights.reduce((sum, w) => sum + w, 0) + myWeight;
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
