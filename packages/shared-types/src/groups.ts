import { z } from "zod";
import { CurrencyCodeSchema } from "./currency.js";
import { SplitModeSchema } from "./people.js";

/**
 * A group: transactions that belong together, and the people who share them.
 * One concept for what used to be "linking" (a card payment and the
 * statement, a transfer between accounts, a refund) and "splitting with
 * people" (a dinner shared three ways, a loan).
 *
 * - Members are transactions. The user's own money has no contact; a
 *   person's payment for the group has theirs. A member can be only part of
 *   its transaction (`allocated`), so one e-transfer can pay for two dinners.
 * - Shares are what each person owes for the group (or is owed), signed like
 *   a balance: + they owe the user. What isn't paid or forgiven yet is an
 *   expected payment.
 *
 * Net (real view) = Σ own members + Σ (share − forgiven). Payments don't move
 * it: they only settle shares. A −90 dinner shared with Sam and Alex at 30
 * each nets to −30, whether or not they've paid yet.
 *
 * A transfer (`kind: "transfer"`) is the other kind of group: money moving
 * between the user's own accounts (to savings, paying a credit card). It holds
 * whole transactions only, no people, at least one out and one in across two
 * or more accounts, and its transactions can be in different currencies. Its
 * net is in the home currency: what's left is an FX difference or a fee.
 */

export const GroupKindSchema = z.enum(["shared", "transfer"]);
export type GroupKind = z.infer<typeof GroupKindSchema>;

export const GroupSplitSchema = z.object({
  mode: SplitModeSchema,
  /** Equal mode: 1 (include the user) or 0 (all theirs). Ignored otherwise. */
  myValue: z.number().min(0),
  participants: z
    .array(
      z.object({
        contactId: z.string().uuid(),
        /** amount mode: the amount · percent: the percentage · equal: ignored. */
        value: z.number().min(0),
      }),
    )
    .min(1)
    .max(30),
});
export type GroupSplit = z.infer<typeof GroupSplitSchema>;

export const GroupMemberSchema = z.object({
  transactionId: z.string().uuid(),
  /** Set when this is a person's payment for the group. */
  contactId: z.string().uuid().nullable(),
  /** The part of the transaction in this group, signed like the transaction. */
  amount: z.number(),
  /** True when only part of the transaction is in this group. */
  allocated: z.boolean(),
  transactionAmount: z.number(),
  /** The transaction's currency: the group's, except across a transfer's sides. */
  currencyCode: CurrencyCodeSchema,
  date: z.string().date(),
  description: z.string(),
  accountId: z.string().uuid().nullable(),
  categoryId: z.string().uuid().nullable(),
});
export type GroupMember = z.infer<typeof GroupMemberSchema>;

export const GroupShareSchema = z.object({
  contactId: z.string().uuid(),
  contactName: z.string(),
  /** Signed like a balance: + they owe the user. */
  amount: z.number(),
  /** Σ their payments in this group, signed like the share. */
  paid: z.number(),
  forgiven: z.number(),
  forgivenOn: z.string().date().nullable(),
  /** Still expected: amount − forgiven − paid. */
  outstanding: z.number(),
});
export type GroupShare = z.infer<typeof GroupShareSchema>;

export const GroupSchema = z.object({
  id: z.string().uuid(),
  kind: GroupKindSchema,
  label: z.string().nullable(),
  /** The label, or the main transaction's description. */
  description: z.string(),
  currencyCode: CurrencyCodeSchema,
  /** The main transaction's date (a transfer's: the money going out). */
  date: z.string().date(),
  /** The user's own transaction with the largest amount; its category and date stand for the group. */
  anchorTransactionId: z.string().uuid(),
  anchorCategoryId: z.string().uuid().nullable(),
  /** In currencyCode. A transfer across currencies: the home-currency difference, in the anchor's currency (null without rates). */
  net: z.number().nullable(),
  members: z.array(GroupMemberSchema),
  shares: z.array(GroupShareSchema),
  split: GroupSplitSchema.nullable(),
});
export type Group = z.infer<typeof GroupSchema>;

/**
 * Creates a group or replaces what's in it, in one go. When `split` is set,
 * the shares are worked out from it (over the user's own money) and `shares`
 * is ignored. What was forgiven stays with each person who stays.
 */
export const SaveGroupInputSchema = z.object({
  label: z.string().trim().max(200).nullable().default(null),
  members: z
    .array(
      z.object({
        transactionId: z.string().uuid(),
        contactId: z.string().uuid().nullable().default(null),
        /** The part of the transaction in this group, as a magnitude; null = all of it. */
        amount: z.number().positive().nullable().default(null),
      }),
    )
    .min(1)
    .max(100),
  shares: z
    .array(z.object({ contactId: z.string().uuid(), amount: z.number().refine((v) => v !== 0, "A share can't be zero") }))
    .max(30)
    .default([]),
  split: GroupSplitSchema.nullable().default(null),
});
export type SaveGroupInput = z.input<typeof SaveGroupInputSchema>;
export type SaveGroupData = z.output<typeof SaveGroupInputSchema>;

/** A transaction that can go in a group: some of it isn't in one yet. */
export const GroupCandidateSchema = z.object({
  id: z.string().uuid(),
  date: z.string().date(),
  description: z.string(),
  amount: z.number(),
  /** What's not in a group yet, signed like amount. */
  available: z.number(),
  currencyCode: CurrencyCodeSchema,
  accountId: z.string().uuid().nullable(),
  accountName: z.string().nullable(),
});
export type GroupCandidate = z.infer<typeof GroupCandidateSchema>;

/** Matches transactions as a transfer between the user's own accounts. */
export const SaveTransferInputSchema = z.object({
  label: z.string().trim().max(200).nullable().default(null),
  transactionIds: z.array(z.string().uuid()).min(2).max(10),
});
export type SaveTransferInput = z.input<typeof SaveTransferInputSchema>;
export type SaveTransferData = z.output<typeof SaveTransferInputSchema>;

/** A transaction that could be the other side of a transfer. */
export const TransferCandidateSchema = GroupCandidateSchema.extend({
  /** Same currency and amount, a few days apart: most likely the other side. */
  likely: z.boolean(),
});
export type TransferCandidate = z.infer<typeof TransferCandidateSchema>;

// ── Calculations shared by the web and the API ─────────────────────────────

const toCents = (amount: number) => Math.round(amount * 100);
const fromCents = (cents: number) => cents / 100;

/** What a person still owes for a group (signed like the share): share − forgiven − paid. */
export function shareOutstanding(share: { amount: number; forgiven: number }, paid: number): number {
  return fromCents(toCents(share.amount) - toCents(share.forgiven) - toCents(paid));
}

/**
 * A group's net in the real view: the user's own money plus what people owe
 * for it (shares less what was forgiven). Payments don't count: they settle
 * shares, they don't change what the group cost the user.
 */
export function groupNet(ownAmounts: number[], shares: { amount: number; forgiven: number }[]): number {
  const own = ownAmounts.reduce((sum, a) => sum + toCents(a), 0);
  const owed = shares.reduce((sum, s) => sum + toCents(s.amount) - toCents(s.forgiven), 0);
  return fromCents(own + owed);
}

/**
 * Whether a transaction's parts fit inside it. `parts` are magnitudes, null
 * for "all of it" (only allowed alone). Returns the problem, or null.
 */
export function allocationProblem(transactionAmount: number, parts: (number | null)[]): null | "whole_and_part" | "over_amount" {
  if (parts.length > 1 && parts.some((p) => p === null)) return "whole_and_part";
  const total = parts.reduce<number>((sum, p) => sum + (p === null ? toCents(Math.abs(transactionAmount)) : toCents(p)), 0);
  return total > toCents(Math.abs(transactionAmount)) ? "over_amount" : null;
}

/**
 * Spreads `available` (a magnitude) over what's still owed, in order (oldest
 * first): each gets as much as it's owed until the money runs out.
 */
export function allocateInOrder(available: number, owed: number[]): number[] {
  let left = toCents(Math.abs(available));
  return owed.map((o) => {
    const take = Math.min(left, Math.max(0, toCents(Math.abs(o))));
    left -= take;
    return fromCents(take);
  });
}

/** Days apart a transfer's two sides can be and still count as a likely match. */
export const TRANSFER_LIKELY_DAYS = 7;

/**
 * How well `candidate` fits as the other side of a transfer from `source`
 * (lower is better), or null when it can't be: same direction, same account,
 * or nothing left of it. Likely matches (same currency and amount, within a
 * week) rank first, then everything else by how close it is in date.
 */
export function transferFit(
  source: { amount: number; currencyCode: string; accountId: string | null; date: string },
  candidate: { amount: number; currencyCode: string; accountId: string | null; date: string },
): { score: number; likely: boolean } | null {
  if (source.amount === 0 || candidate.amount === 0) return null;
  if (Math.sign(source.amount) === Math.sign(candidate.amount)) return null;
  if (!source.accountId || !candidate.accountId || source.accountId === candidate.accountId) return null;
  const days = Math.abs(Date.parse(source.date) - Date.parse(candidate.date)) / 86_400_000;
  const sameCurrency = source.currencyCode === candidate.currencyCode;
  const sameAmount = sameCurrency && toCents(Math.abs(source.amount)) === toCents(Math.abs(candidate.amount));
  const likely = sameAmount && days <= TRANSFER_LIKELY_DAYS;
  return { score: (likely ? 0 : 1000) + days, likely };
}
