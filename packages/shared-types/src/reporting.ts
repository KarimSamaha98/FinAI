import { z } from "zod";
import { CurrencyCodeSchema } from "./currency.js";
import { CategoryIconKeySchema } from "./category.js";
import { TransactionViewSchema } from "./transaction.js";

export const InsightModeSchema = z.enum(["monthly", "yearly"]);
export type InsightMode = z.infer<typeof InsightModeSchema>;

export const InsightPeriodSchema = z.object({
  mode: InsightModeSchema.default("monthly"),
  period: z.string(),
});
export type InsightPeriod = z.infer<typeof InsightPeriodSchema>;

export const AmountKindSchema = z.enum(["expense", "income"]);
export type AmountKind = z.infer<typeof AmountKindSchema>;

export const CategoryBreakdownPointSchema = z.object({
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string(),
  total: z.number(),
});
export type CategoryBreakdownPoint = z.infer<typeof CategoryBreakdownPointSchema>;

export const DashboardSummarySchema = z.object({
  totalExpense: z.number(),
  totalIncome: z.number(),
  netIncome: z.number(),
  savingsRate: z.number().nullable(),
});
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;

export const BucketGranularitySchema = z.enum(["daily", "weekly", "monthly", "yearly"]);
export type BucketGranularity = z.infer<typeof BucketGranularitySchema>;

export const TimeseriesPointSchema = z.object({
  bucketStart: z.string().date(),
  bucketLabel: z.string(),
  total: z.number(),
});
export type TimeseriesPoint = z.infer<typeof TimeseriesPointSchema>;

export const TimeseriesResponseSchema = z.object({
  granularity: BucketGranularitySchema,
  points: z.array(TimeseriesPointSchema),
});
export type TimeseriesResponse = z.infer<typeof TimeseriesResponseSchema>;

export const CategoryBreakdownResponseSchema = z.object({
  points: z.array(CategoryBreakdownPointSchema),
});
export type CategoryBreakdownResponse = z.infer<typeof CategoryBreakdownResponseSchema>;

export const HeatmapDaySchema = z.object({
  date: z.string().date(),
  total: z.number(),
});
export type HeatmapDay = z.infer<typeof HeatmapDaySchema>;

export const HeatmapResponseSchema = z.object({
  days: z.array(HeatmapDaySchema),
});
export type HeatmapResponse = z.infer<typeof HeatmapResponseSchema>;

export const CategoryChangeTypeSchema = z.enum([
  'expense_spike',
  'expense_improvement',
  'income_spike',
  'income_reduction',
]);
export type CategoryChangeType = z.infer<typeof CategoryChangeTypeSchema>;

export const CategoryChangeSchema = z.object({
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string(),
  kind: z.enum(['expense', 'income']),
  type: CategoryChangeTypeSchema,
  currentTotal: z.number(),
  previousTotal: z.number(),
  percentChange: z.number(),
});
export type CategoryChange = z.infer<typeof CategoryChangeSchema>;

export const TopExpenseSchema = z.object({
  id: z.string().uuid(),
  date: z.string().date(),
  description: z.string(),
  amount: z.number(),
  currencyCode: CurrencyCodeSchema,
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string().nullable(),
  categoryIcon: CategoryIconKeySchema.nullable(),
});
export type TopExpense = z.infer<typeof TopExpenseSchema>;

export const RecurringPaymentSchema = z.object({
  description: z.string(),
  amount: z.number(),
  currencyCode: CurrencyCodeSchema,
  occurrenceCount: z.number().int(),
  monthCount: z.number().int(),
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string().nullable(),
  categoryIcon: CategoryIconKeySchema.nullable(),
});
export type RecurringPayment = z.infer<typeof RecurringPaymentSchema>;

export const ImportantThingsResponseSchema = z.object({
  categoryChanges: z.array(CategoryChangeSchema),
  topExpenses: z.array(TopExpenseSchema),
  recurringPayments: z.array(RecurringPaymentSchema),
});
export type ImportantThingsResponse = z.infer<typeof ImportantThingsResponseSchema>;

export const TrendPointSchema = z.object({
  period: z.string(),
  label: z.string(),
  totalIncome: z.number(),
  totalExpense: z.number(),
  savingsRate: z.number().nullable(),
});
export type TrendPoint = z.infer<typeof TrendPointSchema>;

export const TrendResponseSchema = z.object({
  points: z.array(TrendPointSchema),
});
export type TrendResponse = z.infer<typeof TrendResponseSchema>;

export const ChartQuerySchema = InsightPeriodSchema;
export type ChartQuery = z.infer<typeof ChartQuerySchema>;
