-- Accounts: a real financial account (checking/credit/e-banking/investment)
-- that transactions and (optionally) a single import profile belong to.
--
-- Balance is computed on read, never stored: starting_balance + the sum of
-- this account's transactions dated after balance_as_of, converted to
-- currency_code (see AccountsService). balance_as_of exists because a user's
-- starting-balance snapshot (taken from their bank/third-party app) already
-- reflects every transaction up to that date, so only later transactions
-- should move the balance — otherwise a historical backfill import would
-- double-count.

create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('checking', 'credit', 'e_banking', 'investment', 'other')),
  institution text,
  currency_code text not null references currencies (code),
  starting_balance numeric(14, 2) not null default 0,
  balance_as_of date not null default current_date,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index accounts_user_lower_name_key on accounts (user_id, lower(name));

alter table accounts enable row level security;

create policy accounts_all_own on accounts
  for all using (user_id = current_app_user_id()) with check (user_id = current_app_user_id());

-- No `on delete cascade` here (matches the existing category_id convention on
-- transactions) — Postgres itself blocks deleting an in-use account;
-- AccountsService pre-checks and suggests archiving instead.

alter table import_profiles add column account_id uuid references accounts (id);

-- At most one import profile per account. Partial (not plain) so existing
-- pre-launch profiles can keep account_id null — profile creation only goes
-- through the account flow going forward, so no forced backfill is needed.
create unique index import_profiles_account_id_key on import_profiles (account_id) where account_id is not null;

alter table transactions add column account_id uuid references accounts (id);
