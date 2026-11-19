-- Whether an account's bank can export transactions as CSV. Asked when the
-- account is created and changeable in its settings; every CSV path (import
-- account picker, "Set up CSV import" prompts) reads it. Cash has no
-- statement to export, so existing cash accounts start with it off.
alter table public.accounts
  add column csv_import_enabled boolean not null default true;

update public.accounts set csv_import_enabled = false where type = 'cash';
