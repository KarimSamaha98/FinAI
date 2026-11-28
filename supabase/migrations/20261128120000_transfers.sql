-- Transfers: money moving between the user's own accounts (a transfer to
-- savings, paying off a credit card) get their own kind of group, apart from
-- groups shared with people.
--
-- A transfer holds two or more whole transactions (at least one out, one in)
-- across at least two accounts, with no people. Unlike a shared group, its
-- transactions can be in different currencies (CAD out of chequing, USD into
-- a USD account): the real view nets them in the home currency, so what's
-- left is the FX difference (or a fee).

alter table public.reconciliation_groups
  add column kind text not null default 'shared'
  check (kind in ('shared', 'transfer'));

-- Existing groups that are already transfers: no people, whole transactions,
-- money both out and in, across two or more accounts.
update public.reconciliation_groups g
set kind = 'transfer', split_mode = null, split_inputs = null
where not exists (select 1 from public.group_shares s where s.group_id = g.id)
  and not exists (
    select 1 from public.reconciliation_group_members m
    where m.group_id = g.id and (m.contact_id is not null or m.amount is not null)
  )
  and (
    select count(distinct t.account_id) from public.reconciliation_group_members m
    join public.transactions t on t.id = m.transaction_id
    where m.group_id = g.id
  ) >= 2
  and exists (
    select 1 from public.reconciliation_group_members m
    join public.transactions t on t.id = m.transaction_id
    where m.group_id = g.id and t.amount < 0
  )
  and exists (
    select 1 from public.reconciliation_group_members m
    join public.transactions t on t.id = m.transaction_id
    where m.group_id = g.id and t.amount > 0
  );
