import { z } from "zod";
import { CurrencyCodeSchema } from "./currency.js";

/**
 * People: the user's balance with each person they share money with.
 *
 * People live in groups (see groups.ts). Each person in a group has a share,
 * signed like a balance: positive = they owe the user, negative = the user
 * owes them. Their payments for that group (transactions tagged with them)
 * settle the share; what's left is an expected payment until it's paid or
 * forgiven. A person's balance = Σ (share − forgiven) − Σ payments.
 */

export const SplitModeSchema = z.enum(["equal", "amount", "percent"]);
export type SplitMode = z.infer<typeof SplitModeSchema>;

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

/** A payment from (or to) a person, as part of one group. */
export const PersonPaymentSchema = z.object({
  transactionId: z.string().uuid(),
  date: z.string().date(),
  description: z.string(),
  /** The part of the transaction for this group, signed like the transaction. */
  amount: z.number(),
});
export type PersonPayment = z.infer<typeof PersonPaymentSchema>;

/** A person's part in one group: what they owe for it and how it was settled. */
export const PersonGroupSchema = z.object({
  groupId: z.string().uuid(),
  /** The group's date (its main transaction's). */
  date: z.string().date(),
  label: z.string(),
  currencyCode: CurrencyCodeSchema,
  /** Their share, signed like a balance (+ they owe the user). */
  share: z.number(),
  /** Σ their payments, signed like the share (what they've paid off of it). */
  paid: z.number(),
  forgiven: z.number(),
  forgivenOn: z.string().date().nullable(),
  /** Still expected: share − forgiven − paid. */
  outstanding: z.number(),
  payments: z.array(PersonPaymentSchema),
});
export type PersonGroup = z.infer<typeof PersonGroupSchema>;

export const PersonDetailSchema = z.object({
  summary: PersonSummarySchema,
  /** Newest first. */
  groups: z.array(PersonGroupSchema),
});
export type PersonDetail = z.infer<typeof PersonDetailSchema>;

// ── Settle up ──────────────────────────────────────────────────────────────

/** How much of a payment goes to each group the person owes in. */
export const PaymentAllocationSchema = z.object({
  groupId: z.string().uuid(),
  amount: z.number().positive(),
});
export type PaymentAllocation = z.infer<typeof PaymentAllocationSchema>;

/**
 * - forgive: let go of everything still expected from (or owed to) them.
 * - match: an existing transaction is their payment, divided between the
 *   groups they owe in (`allocations`, magnitudes).
 * - new: record that payment as a new transaction on an account, then match it.
 */
export const SettleUpInputSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("forgive") }),
  z.object({
    method: z.literal("match"),
    transactionId: z.string().uuid(),
    allocations: z.array(PaymentAllocationSchema).min(1).max(100),
  }),
  z.object({
    method: z.literal("new"),
    accountId: z.string().uuid(),
    amount: z.number().positive(),
    date: z.string().date(),
    description: z.string().trim().min(1).max(200),
    allocations: z.array(PaymentAllocationSchema).min(1).max(100),
  }),
]);
export type SettleUpInput = z.infer<typeof SettleUpInputSchema>;

/** A transaction that could be a person's payment: the right direction, with some of it not in a group yet. */
export const SettleUpCandidateSchema = z.object({
  id: z.string().uuid(),
  date: z.string().date(),
  description: z.string(),
  amount: z.number(),
  /** What's not in a group yet, signed like amount. */
  available: z.number(),
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
 * A person's share of a group, signed like a balance: the opposite sign of
 * the group's own money. An expense (−) split → they owe the user (+); money
 * in (+) they lent → the user owes them (−).
 */
export function shareAmount(groupTotal: number, portion: number): number {
  const cents = toCents(Math.abs(portion));
  return fromCents(groupTotal < 0 ? cents : -cents);
}
