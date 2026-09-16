-- Initial schema: reference data, per-user tenant tables, and RLS.
--
-- The backend (apps/api) connects to Postgres directly via a connection pool,
-- not through Supabase's PostgREST/GoTrue layer, so RLS policies cannot rely
-- on auth.uid(). Instead, every request runs inside a transaction that first
-- sets a session-local `app.current_user_id` GUC (see
-- apps/api/src/db/tenant-context.ts), and policies check that value. This is
-- deliberate defense-in-depth: even a service method that forgets a
-- `WHERE user_id = ...` clause is still blocked by Postgres itself.

create extension if not exists pgcrypto;

create or replace function current_app_user_id() returns uuid
  language sql stable
  as $$
    select current_setting('app.current_user_id', true)::uuid
  $$;

-- ── Reference data (global, not per-user) ──────────────────────────────────

create table currencies (
  code text primary key,
  name text not null,
  symbol text not null
);

alter table currencies enable row level security;

create policy currencies_select_all on currencies
  for select using (true);

-- ── Profiles ────────────────────────────────────────────────────────────────

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  home_currency_code text not null references currencies (code),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy profiles_select_own on profiles
  for select using (id = current_app_user_id());

create policy profiles_update_own on profiles
  for update using (id = current_app_user_id());

-- Auto-create a profile row whenever a new Supabase Auth user signs up.
create or replace function handle_new_user() returns trigger
  language plpgsql security definer
  as $$
  begin
    insert into public.profiles (id, home_currency_code)
    values (new.id, 'USD');
    return new;
  end;
  $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Categories (flat; NULL user_id = shared preset, non-editable) ──────────

create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create unique index categories_user_lower_name_key on categories (user_id, lower(name));

alter table categories enable row level security;

create policy categories_select on categories
  for select using (user_id is null or user_id = current_app_user_id());

create policy categories_insert_own on categories
  for insert with check (user_id = current_app_user_id());

create policy categories_update_own on categories
  for update using (user_id = current_app_user_id());

create policy categories_delete_own on categories
  for delete using (user_id = current_app_user_id());

-- ── Import profiles ─────────────────────────────────────────────────────────

create table import_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  currency_code text not null references currencies (code),
  has_header boolean not null,
  delimiter text not null default ',',
  column_mapping jsonb not null,
  date_format text not null,
  sign_convention text not null check (sign_convention in ('positive_is_expense', 'positive_is_income')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table import_profiles enable row level security;

create policy import_profiles_all_own on import_profiles
  for all using (user_id = current_app_user_id()) with check (user_id = current_app_user_id());

-- ── Uploaded files (raw import source, retained for audit/re-import) ───────

create table uploaded_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  row_count integer,
  uploaded_at timestamptz not null default now()
);

alter table uploaded_files enable row level security;

create policy uploaded_files_all_own on uploaded_files
  for all using (user_id = current_app_user_id()) with check (user_id = current_app_user_id());

-- ── Import runs ──────────────────────────────────────────────────────────────

create table import_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  uploaded_file_id uuid not null references uploaded_files (id) on delete cascade,
  import_profile_id uuid not null references import_profiles (id) on delete cascade,
  status text not null check (status in ('pending_review', 'committed', 'cancelled')),
  created_at timestamptz not null default now(),
  committed_at timestamptz
);

alter table import_runs enable row level security;

create policy import_runs_all_own on import_runs
  for all using (user_id = current_app_user_id()) with check (user_id = current_app_user_id());

-- ── Transactions ─────────────────────────────────────────────────────────────
-- Canonical signed amount: negative = expense, positive = income.

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  amount numeric(14, 2) not null,
  currency_code text not null references currencies (code),
  description text not null default '',
  category_id uuid references categories (id) on delete set null,
  source_type text not null check (source_type in ('manual', 'import')),
  import_profile_id uuid references import_profiles (id) on delete set null,
  import_run_id uuid references import_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transactions_user_date_idx on transactions (user_id, date);

alter table transactions enable row level security;

create policy transactions_all_own on transactions
  for all using (user_id = current_app_user_id()) with check (user_id = current_app_user_id());

-- ── Reconciliation groups ────────────────────────────────────────────────────
-- Non-destructive linking: members keep their own date/amount/category; net
-- and anchor category are computed on read (see reporting-query.service.ts).

create table reconciliation_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text,
  created_at timestamptz not null default now()
);

alter table reconciliation_groups enable row level security;

create policy reconciliation_groups_all_own on reconciliation_groups
  for all using (user_id = current_app_user_id()) with check (user_id = current_app_user_id());

create table reconciliation_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references reconciliation_groups (id) on delete cascade,
  transaction_id uuid not null unique references transactions (id) on delete cascade
);

alter table reconciliation_group_members enable row level security;

create policy reconciliation_group_members_all_own on reconciliation_group_members
  for all using (
    exists (
      select 1 from reconciliation_groups g
      where g.id = reconciliation_group_members.group_id
        and g.user_id = current_app_user_id()
    )
  )
  with check (
    exists (
      select 1 from reconciliation_groups g
      where g.id = reconciliation_group_members.group_id
        and g.user_id = current_app_user_id()
    )
  );

-- ── Month splits ─────────────────────────────────────────────────────────────
-- Even split only; per-month amount = amount / num_months, computed on read.

create table month_splits (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references transactions (id) on delete cascade,
  start_month date not null,
  num_months integer not null check (num_months >= 2 and num_months <= 60)
);

alter table month_splits enable row level security;

create policy month_splits_all_own on month_splits
  for all using (
    exists (
      select 1 from transactions t
      where t.id = month_splits.transaction_id
        and t.user_id = current_app_user_id()
    )
  )
  with check (
    exists (
      select 1 from transactions t
      where t.id = month_splits.transaction_id
        and t.user_id = current_app_user_id()
    )
  );

-- ── FX rates (per-user, single current rate per currency pair) ─────────────

create table fx_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  base_currency text not null references currencies (code),
  quote_currency text not null references currencies (code),
  rate numeric not null check (rate > 0),
  updated_at timestamptz not null default now(),
  unique (user_id, base_currency, quote_currency)
);

alter table fx_rates enable row level security;

create policy fx_rates_all_own on fx_rates
  for all using (user_id = current_app_user_id()) with check (user_id = current_app_user_id());
