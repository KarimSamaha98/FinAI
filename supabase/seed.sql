-- Reference currencies.
insert into currencies (code, name, symbol) values
  ('USD', 'US Dollar', '$'),
  ('CAD', 'Canadian Dollar', '$'),
  ('EUR', 'Euro', '€'),
  ('GBP', 'British Pound', '£'),
  ('AUD', 'Australian Dollar', '$'),
  ('JPY', 'Japanese Yen', '¥')
on conflict (code) do nothing;

-- Preset categories (user_id IS NULL = shared, non-editable).
insert into categories (user_id, name) values
  (null, 'Groceries'),
  (null, 'Dining'),
  (null, 'Rent'),
  (null, 'Utilities'),
  (null, 'Transport'),
  (null, 'Salary'),
  (null, 'Transfers'),
  (null, 'Entertainment'),
  (null, 'Health'),
  (null, 'Shopping'),
  (null, 'Travel'),
  (null, 'Insurance'),
  (null, 'Subscriptions'),
  (null, 'Reimbursement'),
  (null, 'Investment'),
  (null, 'Other')
on conflict (user_id, lower(name)) do nothing;
