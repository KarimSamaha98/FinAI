import { z } from "zod";
import { CurrencyCodeSchema } from "./currency.js";

export const SignConventionSchema = z.enum(["positive_is_expense", "positive_is_income"]);
export type SignConvention = z.infer<typeof SignConventionSchema>;

/**
 * A single mapped field can be located either by header name (files with a
 * header row) or by zero-based column index (headerless files, e.g. CIBC
 * exports). Only one of the two forms is used per profile, decided by
 * ImportProfile.hasHeader.
 */
export const ColumnRefSchema = z.union([
  z.object({ type: z.literal("name"), value: z.string() }),
  z.object({ type: z.literal("index"), value: z.number().int().nonnegative() }),
]);
export type ColumnRef = z.infer<typeof ColumnRefSchema>;

/**
 * A row's currency is either fixed for the whole profile (today's behavior —
 * every bank export in a single currency) or read per-row from a mapped
 * column, for multi-currency accounts like Wise/Revolut where one export can
 * contain several currencies at once.
 */
export const CurrencyMappingSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("fixed"), code: CurrencyCodeSchema }),
  z.object({ mode: z.literal("column"), column: ColumnRefSchema }),
]);
export type CurrencyMapping = z.infer<typeof CurrencyMappingSchema>;

/**
 * Amount mapping has three mutually exclusive modes, fixed at profile creation:
 *  - "single": one column; sign of the transaction is derived from
 *    signConvention (a positive cell means expense or income, per convention).
 *  - "dual": two columns, one holding only-positive expense amounts and the
 *    other only-positive income amounts (e.g. bank exports with separate
 *    debit/credit columns). Exactly one is expected to be populated per row;
 *    the parser skips rows where both are blank and errors on rows where
 *    both are populated (ambiguous). No signConvention — sign is positional.
 *  - "directional": a magnitude column (always positive, e.g. Wise's "Source
 *    amount (after fees)") plus a direction column whose raw cell value is
 *    compared against inValue/outValue (e.g. Wise's "Direction" column,
 *    "IN"/"OUT") to decide the sign. A row whose direction cell matches
 *    neither configured value is a parse error.
 */
export const AmountMappingSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("single"),
    column: ColumnRefSchema,
    signConvention: SignConventionSchema,
  }),
  z.object({
    mode: z.literal("dual"),
    expenseColumn: ColumnRefSchema,
    incomeColumn: ColumnRefSchema,
  }),
  z.object({
    mode: z.literal("directional"),
    amountColumn: ColumnRefSchema,
    directionColumn: ColumnRefSchema,
    inValue: z.string().min(1),
    outValue: z.string().min(1),
  }),
]);
export type AmountMapping = z.infer<typeof AmountMappingSchema>;

export const ColumnMappingSchema = z.object({
  date: ColumnRefSchema,
  description: ColumnRefSchema,
  amount: AmountMappingSchema,
  currency: CurrencyMappingSchema,
});
export type ColumnMapping = z.infer<typeof ColumnMappingSchema>;

export const ImportProfileSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  // Nullable to accommodate pre-accounts legacy profiles; required on create
  // going forward — see CreateImportProfileInputSchema. A given account can
  // have at most one profile (enforced by a partial unique DB index).
  accountId: z.string().uuid().nullable(),
  name: z.string().min(1).max(80),
  hasHeader: z.boolean(),
  delimiter: z.string().min(1).max(1).default(","),
  columnMapping: ColumnMappingSchema,
  dateFormat: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ImportProfile = z.infer<typeof ImportProfileSchema>;

export const CreateImportProfileInputSchema = ImportProfileSchema.omit({
  id: true,
  userId: true,
  accountId: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  accountId: z.string().uuid(),
});
export type CreateImportProfileInput = z.infer<typeof CreateImportProfileInputSchema>;

export const UpdateImportProfileInputSchema = CreateImportProfileInputSchema.partial().extend({
  id: z.string().uuid(),
});
export type UpdateImportProfileInput = z.infer<typeof UpdateImportProfileInputSchema>;

export const PreviewRawRowsInputSchema = z.object({
  uploadedFileId: z.string().uuid(),
  delimiter: z.string().min(1).max(1).default(","),
  hasHeader: z.boolean(),
  rowLimit: z.number().int().positive().max(50).default(10),
});
export type PreviewRawRowsInput = z.infer<typeof PreviewRawRowsInputSchema>;

export const PreviewRawRowsResultSchema = z.object({
  headerRow: z.array(z.string()).nullable(),
  sampleRows: z.array(z.array(z.string())),
});
export type PreviewRawRowsResult = z.infer<typeof PreviewRawRowsResultSchema>;

export const UploadedFileSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  storagePath: z.string(),
  originalFilename: z.string(),
  rowCount: z.number().int().nonnegative().nullable(),
  uploadedAt: z.string().datetime(),
});
export type UploadedFile = z.infer<typeof UploadedFileSchema>;

export const ImportRunStatusSchema = z.enum(["pending_review", "committed", "cancelled"]);
export type ImportRunStatus = z.infer<typeof ImportRunStatusSchema>;

/**
 * One parsed, non-duplicate row awaiting a category choice. Likely-duplicate
 * rows (matched against existing transactions in the file's date range) are
 * filtered out before this point and never reach the client — see
 * ParseWithProfileResult.skippedDuplicateCount for the passive summary note.
 */
export const CandidateRowSchema = z.object({
  rowIndex: z.number().int().nonnegative(),
  date: z.string().date(),
  amount: z.number(),
  currencyCode: CurrencyCodeSchema,
  description: z.string(),
});
export type CandidateRow = z.infer<typeof CandidateRowSchema>;

export const ParseWithProfileInputSchema = z.object({
  uploadedFileId: z.string().uuid(),
  importProfileId: z.string().uuid(),
});
export type ParseWithProfileInput = z.infer<typeof ParseWithProfileInputSchema>;

export const ParseWithProfileResultSchema = z.object({
  importRunId: z.string().uuid(),
  rows: z.array(CandidateRowSchema),
  skippedDuplicateCount: z.number().int().nonnegative(),
});
export type ParseWithProfileResult = z.infer<typeof ParseWithProfileResultSchema>;

/**
 * Every remaining (non-duplicate, already-parsed) row must be assigned a
 * category — the categorization deck has no skip action. The backend
 * re-parses the source file by rowIndex rather than trusting client-supplied
 * date/amount/description, since candidate rows are never persisted.
 */
export const CommitImportRunInputSchema = z.object({
  importRunId: z.string().uuid(),
  rows: z.array(
    z.object({
      rowIndex: z.number().int().nonnegative(),
      categoryId: z.string().uuid(),
    }),
  ),
});
export type CommitImportRunInput = z.infer<typeof CommitImportRunInputSchema>;

export const CommitImportRunResultSchema = z.object({
  importedCount: z.number().int().nonnegative(),
});
export type CommitImportRunResult = z.infer<typeof CommitImportRunResultSchema>;
