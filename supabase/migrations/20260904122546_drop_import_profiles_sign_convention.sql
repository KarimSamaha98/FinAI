-- sign_convention moves entirely into column_mapping (jsonb) to support both
-- single-column and dual expense/income-column import profiles — see
-- packages/shared-types/src/import-profile.ts's AmountMappingSchema.

alter table import_profiles drop column sign_convention;
