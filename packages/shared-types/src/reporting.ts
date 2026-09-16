import { z } from "zod";
import { CurrencyCodeSchema } from "./currency.js";
import { TransactionViewSchema } from "./transaction.js";

// Unlike TransactionListQuerySchema/DateRangeFilterSchema, from/to are
// REQUIRED here: every chart/summary endpoint needs concrete bounds to
// compute bucket granularity and moving-average windows server-side.
export const ChartQuerySchema = z.object({
  dateRange: z.object({ from: z.string().date(), to: z.string().date() }),
  categoryIds: z.array(z.string().uuid()).optional(),
  view: TransactionViewSchema.default("real"),
});
export type ChartQuery = z.infer<typeof ChartQuerySchema>;

export const AmountKindSchema = z.enum(["expense", "income"]);
export type AmountKind = z.infer<typeof AmountKindSchema>;

export const CategoryBreakdownPointSchema = z.object({
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string(),
  total: z.number(),
});
export type CategoryBreakdownPoint = z.infer<typeof CategoryBreakdownPointSchema>;

export const ExcludedCurrencySchema = z.object({
  currencyCode: CurrencyCodeSchema,
  transactionCount: z.number().int().nonnegative(),
});
export type ExcludedCurrency = z.infer<typeof ExcludedCurrencySchema>;

export const CategoryBreakdownResponseSchema = z.object({
  points: z.array(CategoryBreakdownPointSchema),
  excludedCurrencies: z.array(ExcludedCurrencySchema),
});
export type CategoryBreakdownResponse = z.infer<typeof CategoryBreakdownResponseSchema>;

export const BucketGranularitySchema = z.enum(["daily", "weekly", "monthly"]);
export type BucketGranularity = z.infer<typeof BucketGranularitySchema>;

export const TimeseriesPointSchema = z.object({
  bucketStart: z.string().date(),
  bucketLabel: z.string(),
  total: z.number(),
  movingAverage: z.number().nullable(),
});
export type TimeseriesPoint = z.infer<typeof TimeseriesPointSchema>;

export const TimeseriesResponseSchema = z.object({
  granularity: BucketGranularitySchema,
  points: z.array(TimeseriesPointSchema),
  excludedCurrencies: z.array(ExcludedCurrencySchema),
});
export type TimeseriesResponse = z.infer<typeof TimeseriesResponseSchema>;

export const DashboardSummarySchema = z.object({
  totalExpense: z.number(),
  totalIncome: z.number(),
  netIncome: z.number(),
  savingsRate: z.number().nullable(),
  excludedCurrencies: z.array(ExcludedCurrencySchema),
});
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;
