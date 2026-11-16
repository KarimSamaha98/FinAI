-- Simplify Bank Sync to the manual flow: no recorded recipes. The only
-- automation is opening the bank sign-on URL; the user downloads the CSV
-- themselves and the extension captures that single download, so the per-
-- user recipe table and its per-connection version pointer are gone.
--
-- bank_connections rows (and their recorded recipes) were created during
-- MVP testing; dropping the tables entirely resets state cleanly.

drop table if exists bank_recipes cascade;
drop table if exists bank_connections cascade;

create table bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id uuid not null references accounts(id) on delete cascade,
  bank_slug text not null,
  login_url text not null,
  status text not null default 'active' check (status in ('active', 'disconnected')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index bank_connections_account_id_key on bank_connections (account_id);
create index bank_connections_user_id_key on bank_connections (user_id);

-- is_owned_account() was created in 20261108120000_bank_sync_connections.sql.

alter table bank_connections add constraint bank_connections_account_own_key
  check (is_owned_account(account_id, user_id));

alter table bank_connections enable row level security;
create policy bank_connections_all_own on bank_connections
  for all using (user_id = current_app_user_id()) with check (user_id = current_app_user_id());
