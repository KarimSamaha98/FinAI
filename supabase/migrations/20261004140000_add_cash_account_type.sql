-- Add 'cash' as an account type: a physical cash wallet tracked as its own
-- account, distinct from checking/e-banking. Replaces the inline CHECK from
-- 20260907120000_add_accounts.sql (Postgres auto-named it accounts_type_check).
-- No data change — existing rows keep their type; new rows may use 'cash'.

alter table accounts drop constraint accounts_type_check;
alter table accounts add constraint accounts_type_check
  check (type in ('checking', 'credit', 'e_banking', 'investment', 'cash', 'other'));
