-- Automatic exchange rates.
--
-- Rates are resolved by the API from an in-memory daily cache (see
-- ExchangeRatesService) — there is no exchange_rates table. This migration
-- only adds the materialized home-currency columns to transactions.

-- Transactions materialize their home-currency value at write time.
-- exchange_rate is the currency_code → home rate (1 when the currencies
-- match); converted_value = amount × exchange_rate (signed like amount).
-- rate_source records whether the rate was inferred (auto) or set by the user
-- (manual), so recomputes never overwrite an explicit override.
alter table transactions
  add column exchange_rate numeric(18, 8),
  add column converted_value numeric(14, 2),
  add column rate_source text not null default 'auto' check (rate_source in ('auto', 'manual'));
