-- People: a running balance with each person the user shares money with.
--
-- The user tags a transaction with people. Each tag is a person_entries row
-- that moves that person's balance; nothing links a repayment to the expense
-- it repays. Balance per person and currency = Σ entries.amount, positive
-- when they owe the user, negative when the user owes them.
--
--   share    — a person's portion of a tagged transaction, written by a
--              transaction_splits row. amount = −(their portion of the
--              transaction amount): splitting a −120 dinner with Sam at 60
--              gives +60 (Sam owes 60); Sam's +60 transfer tagged to Sam
--              gives −60 (back to 0).
--   cash     — money that changed hands outside any tracked account.
--   writeoff — "settle up": clears what's left. It points at the
--              account-less 'adjustment' transaction that books the
--              difference as spending (or income).
--
-- Net worth counts the balances (converted at today's rate); the real view
-- adds a transaction's share entries to its amount (see ReportingQueryService).

-- ── People ──────────────────────────────────────────────────────────────────

create table contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  -- Later: a contact that is another Frugal user. Unused for now.
  linked_user_id uuid,
  created_at timestamptz not null default now()
);

create unique index contacts_user_lower_name_key on contacts (user_id, lower(display_name));

alter table contacts enable row level security;

create policy contacts_all_own on contacts
  for all using (user_id = current_app_user_id()) with check (user_id = current_app_user_id());

-- ── Splits ──────────────────────────────────────────────────────────────────
-- How a transaction was divided between the user and people. Inputs are kept
-- so the split reopens as the user left it; the resolved per-person amounts
-- live on the share entries.

create table transaction_splits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid not null unique references transactions (id) on delete cascade,
  mode text not null check (mode in ('equal', 'amount', 'percent', 'shares')),
  -- { "me": number, "participants": [{ "contactId": uuid, "value": number }] }
  inputs jsonb not null default '{}'::jsonb,
  -- The user's own portion, as a magnitude in the transaction's currency.
  my_share numeric(14, 2) not null check (my_share >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table transaction_splits enable row level security;

create policy transaction_splits_all_own on transaction_splits
  for all using (user_id = current_app_user_id()) with check (user_id = current_app_user_id());

-- ── Entries ─────────────────────────────────────────────────────────────────

create table person_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid not null references contacts (id),
  kind text not null check (kind in ('share', 'cash', 'writeoff')),
  transaction_id uuid references transactions (id) on delete cascade,
  split_id uuid references transaction_splits (id) on delete cascade,
  amount numeric(14, 2) not null check (amount <> 0),
  currency_code text not null references currencies (code),
  date date not null,
  note text,
  created_at timestamptz not null default now(),
  constraint person_entries_kind_links check (
    (kind = 'share' and transaction_id is not null and split_id is not null)
    or (kind = 'cash' and transaction_id is null and split_id is null)
    or (kind = 'writeoff' and transaction_id is not null and split_id is null)
  )
);

create index person_entries_user_contact_idx on person_entries (user_id, contact_id);
create index person_entries_transaction_idx on person_entries (transaction_id) where transaction_id is not null;

alter table person_entries enable row level security;

create policy person_entries_all_own on person_entries
  for all using (user_id = current_app_user_id()) with check (user_id = current_app_user_id());

-- ── Account-less transactions ───────────────────────────────────────────────
-- 'adjustment': what "settle up" writes off. It has no account_id, so it never
-- moves an account balance.

alter table transactions drop constraint transactions_source_type_check;
alter table transactions
  add constraint transactions_source_type_check
  check (source_type in ('manual', 'import', 'adjustment'));

-- ── Profile setting ─────────────────────────────────────────────────────────

alter table profiles
  add column count_ious_in_net_worth boolean not null default true;
