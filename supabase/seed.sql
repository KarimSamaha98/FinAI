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
-- 20261004180000_category_icons.sql) and can then rename, add to, or
-- archive their own copies freely. Guarded with NOT EXISTS because the
-- (user_id, lower(name)) unique index can't dedupe NULL user_ids, so a plain
-- ON CONFLICT would not make this idempotent.
insert into categories (user_id, name, icon)
select null, v.name, v.icon
from (values
  ('Groceries', 'cart'), ('Dining', 'utensils'), ('Rent', 'home'), ('Utilities', 'bolt'),
  ('Transport', 'car'), ('Salary', 'banknote'), ('Transfers', 'transfer'), ('Entertainment', 'film'),
  ('Health', 'heart'), ('Shopping', 'bag'), ('Travel', 'plane'), ('Insurance', 'shield'),
  ('Subscriptions', 'repeat'), ('Reimbursement', 'receipt'), ('Investment', 'trending-up'), ('Other', 'tag')
) as v(name, icon)
where not exists (
  select 1 from categories c where c.user_id is null and lower(c.name) = lower(v.name)
);
