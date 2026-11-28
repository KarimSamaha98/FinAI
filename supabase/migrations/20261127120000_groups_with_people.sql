-- Groups with people: linking transactions and sharing them with people become
-- one concept, a group (the reconciliation_groups tables, shown as "Group").
--
-- A group holds:
--   * transaction members (reconciliation_group_members)
--       - the user's own money (contact_id null): the main transaction, a
--         refund, a card payment, a transfer between accounts;
--       - a person's payment (contact_id set): money they sent the user (or
--         the user sent them) for this group.
--     `amount` is the part of the transaction that belongs to this group
--     (same sign as the transaction); null = all of it. One transaction can
--     be divided between groups (one e-transfer paying for two dinners), as
--     long as the parts add up to no more than its amount.
--   * shares (group_shares): each person's portion, signed like a balance
--     (positive = they owe the user). What they still owe in this group =
--     amount − forgiven − Σ their payments in it; the user sees that as an
--     expected payment until it is paid or forgiven.
--
-- Group net (real view) = Σ own members + Σ (share − forgiven). Payments
-- don't change it: they only settle the shares. A person's balance =
-- Σ (share − forgiven) − Σ payments. Forgiving drops the share out of the
-- net, so the loss lands on the group's own date.
--
-- This replaces transaction_splits, person_entries and the account-less
-- 'adjustment' transactions settle up wrote. People was never released, so
-- existing rows only live in development databases; they are converted with
-- every balance unchanged.

-- ── Groups and members ──────────────────────────────────────────────────────

alter table reconciliation_groups
  add column split_mode text check (split_mode in ('equal', 'amount', 'percent')),
  -- { "me": number, "participants": [{ "contactId": uuid, "value": number }] }
  add column split_inputs jsonb;

alter table reconciliation_group_members
  add column contact_id uuid references contacts (id),
  add column amount numeric(14, 2) check (amount is null or amount <> 0);

alter table reconciliation_group_members drop constraint reconciliation_group_members_transaction_id_key;
alter table reconciliation_group_members
  add constraint reconciliation_group_members_group_transaction_key unique (group_id, transaction_id);
create index reconciliation_group_members_transaction_idx on reconciliation_group_members (transaction_id);
create index reconciliation_group_members_contact_idx on reconciliation_group_members (contact_id) where contact_id is not null;

-- ── Shares ──────────────────────────────────────────────────────────────────

create table group_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  group_id uuid not null references reconciliation_groups (id) on delete cascade,
  contact_id uuid not null references contacts (id),
  amount numeric(14, 2) not null check (amount <> 0),
  currency_code text not null references currencies (code),
  -- What the user let go of, same sign as amount; forgiven_on is the day.
  forgiven numeric(14, 2) not null default 0,
  forgiven_on date,
  created_at timestamptz not null default now(),
  constraint group_shares_group_contact_key unique (group_id, contact_id),
  constraint group_shares_forgiven_dated check ((forgiven = 0) = (forgiven_on is null))
);

create index group_shares_user_contact_idx on group_shares (user_id, contact_id);

alter table group_shares enable row level security;

create policy group_shares_all_own on group_shares
  for all using (user_id = current_app_user_id()) with check (user_id = current_app_user_id());

-- ── Convert People data ─────────────────────────────────────────────────────

do $$
declare
  s record;
  d record;
  w record;
  g uuid;
  contact uuid;
  remaining numeric;
  take numeric;
begin
  -- 1. Every split except money received from one person becomes a group:
  --    the transaction, and a share per person (their old entry).
  for s in
    select ts.*, t.amount as t_amount, t.date as t_date
    from transaction_splits ts
    join transactions t on t.id = ts.transaction_id
    where not (t.amount > 0 and ts.my_share = 0 and jsonb_array_length(ts.inputs -> 'participants') = 1)
    order by t.date, ts.created_at
  loop
    insert into reconciliation_groups (user_id, split_mode, split_inputs)
    values (s.user_id, s.mode, s.inputs)
    returning id into g;
    insert into reconciliation_group_members (group_id, transaction_id) values (g, s.transaction_id);
    insert into group_shares (user_id, group_id, contact_id, amount, currency_code, created_at)
    select s.user_id, g, e.contact_id, e.amount, e.currency_code, e.created_at
    from person_entries e
    where e.split_id = s.id;
  end loop;

  -- 2. Money received from one person pays what they owe, oldest first.
  --    Whatever is left over is now owed back to them (a group of its own).
  for s in
    select ts.*, t.amount as t_amount, t.currency_code, t.date as t_date
    from transaction_splits ts
    join transactions t on t.id = ts.transaction_id
    where t.amount > 0 and ts.my_share = 0 and jsonb_array_length(ts.inputs -> 'participants') = 1
    order by t.date, ts.created_at
  loop
    contact := (s.inputs -> 'participants' -> 0 ->> 'contactId')::uuid;
    remaining := s.t_amount;
    for d in
      select gs.group_id,
             gs.amount - gs.forgiven - coalesce((
               select sum(m.amount) from reconciliation_group_members m
               where m.group_id = gs.group_id and m.contact_id = gs.contact_id), 0) as open
      from group_shares gs
      where gs.contact_id = contact and gs.currency_code = s.currency_code
      order by (select min(t.date) from reconciliation_group_members m join transactions t on t.id = m.transaction_id
                where m.group_id = gs.group_id and m.contact_id is null), gs.created_at
    loop
      exit when remaining <= 0;
      continue when d.open <= 0;
      take := least(remaining, d.open);
      insert into reconciliation_group_members (group_id, transaction_id, contact_id, amount)
      values (d.group_id, s.transaction_id, contact, take);
      remaining := remaining - take;
    end loop;
    if remaining > 0 then
      insert into reconciliation_groups (user_id) values (s.user_id) returning id into g;
      insert into reconciliation_group_members (group_id, transaction_id, amount)
      values (g, s.transaction_id, case when remaining = s.t_amount then null else remaining end);
      insert into group_shares (user_id, group_id, contact_id, amount, currency_code)
      values (s.user_id, g, contact, -remaining, s.currency_code);
    end if;
  end loop;

  -- 3. A forgiving settle up forgives what was owed, oldest first.
  for w in select * from person_entries where kind = 'writeoff' order by date, created_at loop
    remaining := -w.amount;
    for d in
      select gs.id,
             gs.amount - gs.forgiven - coalesce((
               select sum(m.amount) from reconciliation_group_members m
               where m.group_id = gs.group_id and m.contact_id = gs.contact_id), 0) as open
      from group_shares gs
      where gs.contact_id = w.contact_id and gs.currency_code = w.currency_code
      order by gs.created_at
    loop
      exit when remaining = 0;
      continue when sign(d.open) <> sign(remaining);
      take := sign(remaining) * least(abs(remaining), abs(d.open));
      update group_shares set forgiven = forgiven + take, forgiven_on = w.date where id = d.id;
      remaining := remaining - take;
    end loop;
  end loop;
end $$;

-- ── Retire the old People tables ────────────────────────────────────────────

drop table person_entries;
drop table transaction_splits;

delete from transactions where source_type = 'adjustment';
alter table transactions drop constraint transactions_source_type_check;
alter table transactions
  add constraint transactions_source_type_check check (source_type in ('manual', 'import'));
