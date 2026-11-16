-- Bank Sync: per-user bank connections and their recorded replay recipes.
--
-- A connection binds one account to the pasted online-banking sign-on URL.
-- A recipe is the versioned list of recorded UI steps (click/fill/select/
-- download — see packages/shared-types/src/bank-sync.ts) that reaches and
-- triggers the bank's CSV export after the user signs on. Recipes are
-- strictly per-user and never shared: RLS below scopes everything to
-- current_app_user_id(), same as every other tenant table.
--
-- One connection per account (a mirrored unique index, like import_profiles)
-- and one active recipe version per connection. Deleting a connection
-- cascades to its recipe versions — they have no value standalone.

create table bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id uuid not null references accounts(id) on delete cascade,
  bank_slug text not null,
  login_url text not null,
  status text not null default 'active' check (status in ('active', 'disconnected')),
  active_recipe_version integer check (active_recipe_version is null or active_recipe_version > 0),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index bank_connections_account_id_key on bank_connections (account_id);
create index bank_connections_user_id_key on bank_connections (user_id);

create table bank_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  connection_id uuid not null references bank_connections(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null check (status in ('active', 'superseded')),
  steps jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index bank_recipes_connection_version_key on bank_recipes (connection_id, version);

-- A connection may only target an account its owner owns. RLS already
-- filters the SELECT path; this guard stops a mismatched account_id from
-- ever being written through any code path. SECURITY DEFINER so the check
-- doesn't depend on the caller's tenant context.
create or replace function is_owned_account(p_account_id uuid, p_user_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
  as $$
    select exists (select 1 from accounts where id = p_account_id and user_id = p_user_id)
  $$;

alter table bank_connections add constraint bank_connections_account_own_key
  check (is_owned_account(account_id, user_id));

alter table bank_connections enable row level security;
create policy bank_connections_all_own on bank_connections
  for all using (user_id = current_app_user_id()) with check (user_id = current_app_user_id());

alter table bank_recipes enable row level security;
create policy bank_recipes_all_own on bank_recipes
  for all using (user_id = current_app_user_id()) with check (user_id = current_app_user_id());
