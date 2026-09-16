import { z } from "zod";

export const MonthSplitSchema = z.object({
  id: z.string().uuid(),
  transactionId: z.string().uuid(),
  startMonth: z.string().date(),
  numMonths: z.number().int().min(2).max(60),
});
export type MonthSplit = z.infer<typeof MonthSplitSchema>;

export const CreateMonthSplitInputSchema = MonthSplitSchema.pick({
  transactionId: true,
  startMonth: true,
  numMonths: true,
});
export type CreateMonthSplitInput = z.infer<typeof CreateMonthSplitInputSchema>;

export const UpdateMonthSplitInputSchema = z.object({
  id: z.string().uuid(),
  startMonth: z.string().date().optional(),
  numMonths: z.number().int().min(2).max(60).optional(),
});
export type UpdateMonthSplitInput = z.infer<typeof UpdateMonthSplitInputSchema>;
