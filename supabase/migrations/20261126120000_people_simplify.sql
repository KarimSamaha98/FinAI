-- People, simplified:
--   * "shares" split mode dropped (percent covers it). Existing shares splits
--     become amount splits with each person's resolved portion, so no balance
--     changes.
--   * "cash" entries dropped. Money that moves outside an account is now
--     recorded as a transaction (settle up → "Add a new transaction", e.g. on a
--     cash account). Existing cash entries are deleted: the feature was never
--     released, so they only exist in development databases.
--   * Notes on splits and entries dropped.

update transaction_splits s
set mode = 'amount',
    inputs = jsonb_build_object(
      'me', 1,
      'participants', coalesce(
        (select jsonb_agg(jsonb_build_object('contactId', e.contact_id, 'value', abs(e.amount)))
         from person_entries e
         where e.split_id = s.id),
        '[]'::jsonb))
where s.mode = 'shares';

alter table transaction_splits drop constraint transaction_splits_mode_check;
alter table transaction_splits
  add constraint transaction_splits_mode_check check (mode in ('equal', 'amount', 'percent'));

delete from person_entries where kind = 'cash';

alter table person_entries drop constraint person_entries_kind_check;
alter table person_entries
  add constraint person_entries_kind_check check (kind in ('share', 'writeoff'));

alter table person_entries drop constraint person_entries_kind_links;
alter table person_entries
  add constraint person_entries_kind_links check (
    (kind = 'share' and transaction_id is not null and split_id is not null)
    or (kind = 'writeoff' and transaction_id is not null and split_id is null)
  );

alter table transaction_splits drop column note;
alter table person_entries drop column note;
