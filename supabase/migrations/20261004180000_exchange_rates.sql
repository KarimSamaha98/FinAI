-- Automatic exchange rates.
--
-- exchange_rates is a global cache of daily base→quote rates, populated on
-- demand from an external provider (Frankfurter) and read by the
-- materialization step whenever a transaction is written. Rates are public
-- reference data (not tenant-scoped), so the app_service role reads and
-- writes them without a tenant context. The app is the only writer (there is
-- no user-facing write endpoint); the permissive policies are deliberate.

create table exchange_rates (
  base_currency text not null references currencies (code),
  quote_currency text not null references currencies (code),
  date date not null,
  rate numeric(18, 8) not null,
  fetched_at timestamptz not null default now(),
  primary key (base_currency, quote_currency, date)
);

create index exchange_rates_lookup_idx
  on exchange_rates (base_currency, quote_currency, date desc);

alter table exchange_rates enable row level security;

create policy exchange_rates_select on exchange_rates for select using (true);
create policy exchange_rates_insert on exchange_rates for insert with check (true);
create policy exchange_rates_update on exchange_rates for update using (true) with check (true);

-- Transactions materialize their home-currency value at write time.
-- exchange_rate is the currency_code → home rate (1 when the currencies
-- match); converted_value = amount × exchange_rate (signed like amount).
-- rate_source records whether the rate was inferred (auto) or set by the user
-- (manual), so recomputes never overwrite an explicit override.
alter table transactions
  add column exchange_rate numeric(18, 8),
  add column converted_value numeric(14, 2),
  add column rate_source text not null default 'auto' check (rate_source in ('auto', 'manual'));
