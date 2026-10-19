-- Support every currency the rate provider publishes, not just the six
-- originally seeded codes. The full list is loaded by the sync:currencies
-- script (see apps/api/src/seed/sync-currencies.ts).
--
-- Some currencies publish no symbol (e.g. COMESA Dollar), so symbol becomes
-- nullable. start_date/end_date bound a currency's valid period, so the UI can
-- hide currencies that don't exist yet (or no longer do).

alter table currencies
  add column start_date date,
  add column end_date date;

alter table currencies alter column symbol drop not null;

-- The app (app_service role) loads the list via the sync:currencies script, so
-- currencies needs write policies beyond the existing select-one. Like
-- exchange_rates, it is public reference data; the permissive policies are
-- deliberate. (seed.sql can't cover deploy environments.)
create policy currencies_insert_all on currencies for insert with check (true);
create policy currencies_update_all on currencies for update using (true) with check (true);
