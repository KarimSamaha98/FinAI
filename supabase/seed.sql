-- Reference currencies.
insert into currencies (code, name, symbol) values
  ('USD', 'US Dollar', '$'),
  ('CAD', 'Canadian Dollar', '$'),
  ('EUR', 'Euro', '€'),
  ('GBP', 'British Pound', '£'),
  ('AUD', 'Australian Dollar', '$'),
  ('JPY', 'Japanese Yen', '¥')
on conflict (code) do nothing;

-- Default category template (user_id IS NULL). Each user gets their own copy
-- of these at signup (see handle_new_user in
-- 20261004170000_per_user_categories.sql) and can then rename, add to, or
-- archive their own copies freely. Guarded with NOT EXISTS because the
-- (user_id, lower(name)) unique index can't dedupe NULL user_ids, so a plain
-- ON CONFLICT would not make this idempotent.
insert into categories (user_id, name)
select null, v.name
from (values
  ('Groceries'), ('Dining'), ('Rent'), ('Utilities'), ('Transport'), ('Salary'),
  ('Transfers'), ('Entertainment'), ('Health'), ('Shopping'), ('Travel'), ('Insurance'),
  ('Subscriptions'), ('Reimbursement'), ('Investment'), ('Other')
) as v(name)
where not exists (
  select 1 from categories c where c.user_id is null and lower(c.name) = lower(v.name)
);
