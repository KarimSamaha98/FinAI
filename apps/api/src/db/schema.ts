import {
  boolean,
  check,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { ColumnMapping } from 'shared-types'

export const currencies = pgTable('currencies', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  // Nullable: some currencies the provider publishes have no symbol.
  symbol: text('symbol'),
  // The currency's valid period, from the provider's /currencies endpoint.
  startDate: date('start_date'),
  endDate: date('end_date'),
})

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  displayName: text('display_name'),
  homeCurrencyCode: text('home_currency_code')
    .notNull()
    .references(() => currencies.code),
  countryCode: text('country_code'),
  avatarPath: text('avatar_path'),
  // Whether balances with people (owed to me / I owe) count in net worth.
  countIousInNetWorth: boolean('count_ious_in_net_worth').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id'),
    name: text('name').notNull(),
    // Icon key from the shared-types CategoryIconKey set; null falls back to "tag".
    icon: text('icon'),
    // Soft delete: an archived category is hidden from pickers but stays
    // attached to the transactions that used it. Uniqueness is enforced only
    // among active rows so a name can be reused after archiving.
    isArchived: boolean('is_archived').notNull().default(false),
    // User-chosen display order (Settings → Categories).
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('categories_user_lower_name_key')
      .on(table.userId, sql`lower(${table.name})`)
      .where(sql`${table.isArchived} = false`),
  ],
)

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    name: text('name').notNull(),
    type: text('type', { enum: ['checking', 'credit', 'investment', 'cash', 'other'] }).notNull(),
    institution: text('institution'),
    currencyCode: text('currency_code')
      .notNull()
      .references(() => currencies.code),
    startingBalance: numeric('starting_balance', { precision: 14, scale: 2 }).notNull().default('0'),
    balanceAsOf: date('balance_as_of').notNull(),
    // Bumped only when startingBalance/balanceAsOf actually change (create, or
    // a targeted update) — distinct from the generic updatedAt below, which a
    // plain rename/currency-change also bumps.
    balanceUpdatedAt: timestamp('balance_updated_at', { withTimezone: true }).notNull().defaultNow(),
    isArchived: boolean('is_archived').notNull().default(false),
    cardColor: text('card_color').notNull().default('#1c1c1e'),
    cardImagePath: text('card_image_path'),
    // Whether the bank can export CSV (asked on account creation; cash defaults to false).
    csvImportEnabled: boolean('csv_import_enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('accounts_user_lower_name_key').on(table.userId, sql`lower(${table.name})`)],
)

export const importProfiles = pgTable(
  'import_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    accountId: uuid('account_id').references(() => accounts.id),
    name: text('name').notNull(),
    hasHeader: boolean('has_header').notNull(),
    delimiter: text('delimiter').notNull().default(','),
    columnMapping: jsonb('column_mapping').notNull().$type<ColumnMapping>(),
    dateFormat: text('date_format').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('import_profiles_account_id_key').on(table.accountId).where(sql`${table.accountId} is not null`)],
)

export const uploadedFiles = pgTable('uploaded_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  storagePath: text('storage_path').notNull(),
  originalFilename: text('original_filename').notNull(),
  rowCount: integer('row_count'),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
})

export const importRuns = pgTable('import_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  uploadedFileId: uuid('uploaded_file_id')
    .notNull()
    .references(() => uploadedFiles.id),
  importProfileId: uuid('import_profile_id')
    .notNull()
    .references(() => importProfiles.id),
  status: text('status', { enum: ['pending_review', 'committed', 'cancelled'] }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  committedAt: timestamp('committed_at', { withTimezone: true }),
})

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  date: date('date').notNull(),
  // Returned as a string by drizzle/postgres for exact decimal precision; parse with Number() at the service boundary.
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  currencyCode: text('currency_code')
    .notNull()
    .references(() => currencies.code),
  description: text('description').notNull().default(''),
  categoryId: uuid('category_id').references(() => categories.id),
  accountId: uuid('account_id').references(() => accounts.id),
  sourceType: text('source_type', { enum: ['manual', 'import'] }).notNull(),
  importProfileId: uuid('import_profile_id').references(() => importProfiles.id),
  importRunId: uuid('import_run_id').references(() => importRuns.id),
  // Home-currency materialization (see exchange_rates migration): the rate
  // currency_code → home and amount × rate, computed at write time.
  exchangeRate: numeric('exchange_rate', { precision: 18, scale: 8 }),
  convertedValue: numeric('converted_value', { precision: 14, scale: 2 }),
  rateSource: text('rate_source', { enum: ['auto', 'manual'] }).notNull().default('auto'),
  // "Needs attention" flag: when the user flagged it to act on later; null = not flagged.
  flaggedAt: timestamp('flagged_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Groups (see supabase/migrations/*_groups_with_people.sql): transactions
// that belong together, and the people who share them.
export interface GroupSplitInputs {
  me: number
  participants: { contactId: string; value: number }[]
}

export const reconciliationGroups = pgTable('reconciliation_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  label: text('label'),
  // How the people's shares were worked out, so the split reopens as left.
  /** shared: transactions that net out and the people who share them · transfer: money moving between the user's own accounts. */
  kind: text('kind', { enum: ['shared', 'transfer'] }).notNull().default('shared'),
  splitMode: text('split_mode', { enum: ['equal', 'amount', 'percent'] }),
  splitInputs: jsonb('split_inputs').$type<GroupSplitInputs>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const reconciliationGroupMembers = pgTable('reconciliation_group_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => reconciliationGroups.id),
  transactionId: uuid('transaction_id')
    .notNull()
    .references(() => transactions.id),
  // Set when the transaction is a person's payment for this group.
  contactId: uuid('contact_id').references(() => contacts.id),
  // The part of the transaction in this group (same sign); null = all of it.
  amount: numeric('amount', { precision: 14, scale: 2 }),
})

export const monthSplits = pgTable(
  'month_splits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .unique()
      .references(() => transactions.id),
    startMonth: date('start_month').notNull(),
    numMonths: integer('num_months').notNull(),
  },
  (table) => [check('month_splits_num_months_check', sql`${table.numMonths} >= 2 and ${table.numMonths} <= 60`)],
)



// ── People (see supabase/migrations/*_people.sql) ────────────────────────────

export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  displayName: text('display_name').notNull(),
  linkedUserId: uuid('linked_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** A person's share of a group, signed like a balance (positive = they owe the user). */
export const groupShares = pgTable('group_shares', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => reconciliationGroups.id),
  contactId: uuid('contact_id')
    .notNull()
    .references(() => contacts.id),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  currencyCode: text('currency_code')
    .notNull()
    .references(() => currencies.code),
  // What the user let go of (same sign as amount), and when.
  forgiven: numeric('forgiven', { precision: 14, scale: 2 }).notNull().default('0'),
  forgivenOn: date('forgiven_on'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
