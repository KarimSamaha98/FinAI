-- Currency now lives entirely inside column_mapping (jsonb) as a `currency`
-- key alongside date/description/amount, supporting both a fixed
-- profile-wide currency (today's behavior) and a per-row currency column for
-- multi-currency accounts (e.g. Wise/Revolut) — see
-- packages/shared-types/src/import-profile.ts's CurrencyMappingSchema.
-- Mirrors the earlier sign_convention migration
-- (20260904122546_drop_import_profiles_sign_convention.sql).

update import_profiles
set column_mapping = column_mapping || jsonb_build_object(
  'currency', jsonb_build_object('mode', 'fixed', 'code', currency_code)
);

alter table import_profiles drop column currency_code;
