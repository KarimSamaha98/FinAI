-- A generic account edit (rename, currency change, archive) and a genuine
-- balance re-baseline ("Update balance", or account creation) both used to
-- bump the same `updated_at` column, so "last balance updated" couldn't be
-- told apart from "someone renamed this account". balance_updated_at is
-- bumped only when starting_balance or balance_as_of actually change — see
-- AccountsService.update().

alter table accounts add column balance_updated_at timestamptz;
update accounts set balance_updated_at = updated_at;
alter table accounts alter column balance_updated_at set not null;
alter table accounts alter column balance_updated_at set default now();
