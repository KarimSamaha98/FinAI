-- "Needs attention" flags: a transaction the user wants to act on later
-- (chase a refund, check a charge). Null = not flagged; the timestamp keeps
-- when it was flagged. Clearing the flag sets it back to null (no history).
-- Table-level grants and the existing RLS policies cover the new column.
alter table public.transactions
  add column flagged_at timestamptz;

-- The flagged list and its count are per-user lookups over a small subset.
create index transactions_flagged_idx
  on public.transactions (user_id)
  where flagged_at is not null;
