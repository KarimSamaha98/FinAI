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
  symbol: text('symbol').notNull(),
})

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  displayName: text('display_name'),
  homeCurrencyCode: text('home_currency_code')
    .notNull()
    .references(() => currencies.code),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id'),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('categories_user_lower_name_key').on(table.userId, sql`lower(${table.name})`)],
)

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    name: text('name').notNull(),
    type: text('type', { enum: ['checking', 'credit', 'e_banking', 'investment', 'other'] }).notNull(),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const reconciliationGroups = pgTable('reconciliation_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  label: text('label'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const reconciliationGroupMembers = pgTable('reconciliation_group_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => reconciliationGroups.id),
  transactionId: uuid('transaction_id')
    .notNull()
    .unique()
    .references(() => transactions.id),
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

export const fxRates = pgTable(
  'fx_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    baseCurrency: text('base_currency')
      .notNull()
      .references(() => currencies.code),
    quoteCurrency: text('quote_currency')
      .notNull()
      .references(() => currencies.code),
    rate: numeric('rate').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('fx_rates_user_pair_key').on(table.userId, table.baseCurrency, table.quoteCurrency)],
)
