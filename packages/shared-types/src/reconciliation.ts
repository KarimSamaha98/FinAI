import { z } from "zod";

export const ReconciliationGroupSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  label: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type ReconciliationGroup = z.infer<typeof ReconciliationGroupSchema>;

export const ReconciliationGroupMemberSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  transactionId: z.string().uuid(),
});
export type ReconciliationGroupMember = z.infer<typeof ReconciliationGroupMemberSchema>;

export const CreateReconciliationGroupInputSchema = z.object({
  label: z.string().nullable().optional(),
  transactionIds: z.array(z.string().uuid()).min(2),
});
export type CreateReconciliationGroupInput = z.infer<typeof CreateReconciliationGroupInputSchema>;

export const AddReconciliationMemberInputSchema = z.object({
  groupId: z.string().uuid(),
  transactionId: z.string().uuid(),
});
export type AddReconciliationMemberInput = z.infer<typeof AddReconciliationMemberInputSchema>;

/**
 * Computed, never stored: net = sum of member amounts (in each member's own
 * currency, converted to home currency by the caller when needed); anchor =
 * the member with the largest absolute amount, whose category/date/description
 * are used for display and category-based reporting.
 */
export const ReconciliationGroupWithComputedSchema = ReconciliationGroupSchema.extend({
  memberTransactionIds: z.array(z.string().uuid()),
  netAmountHomeCurrency: z.number(),
  anchorTransactionId: z.string().uuid(),
  anchorCategoryId: z.string().uuid().nullable(),
});
export type ReconciliationGroupWithComputed = z.infer<typeof ReconciliationGroupWithComputedSchema>;
