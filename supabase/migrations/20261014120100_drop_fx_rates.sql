-- Retire per-user manual FX rates. Automatic daily rates (resolved on demand
-- by the API) plus a per-transaction override replace the fx_rates mechanism.

drop table fx_rates;
