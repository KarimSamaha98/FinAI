-- Category icons: users can assign an icon (a shared-types CategoryIconKey)
-- to each category. Existing default categories are backfilled by name, and
-- the signup trigger copies the icon from the global template rows so new
-- users' seeds carry their icons.

alter table categories add column icon text;

-- 1. Icons for the global template rows (user_id IS NULL), matched by name.
update categories c
set icon = v.icon
from (values
  ('Groceries', 'cart'),
  ('Dining', 'utensils'),
  ('Rent', 'home'),
  ('Utilities', 'bolt'),
  ('Transport', 'car'),
  ('Salary', 'banknote'),
  ('Transfers', 'transfer'),
  ('Entertainment', 'film'),
  ('Health', 'heart'),
  ('Shopping', 'bag'),
  ('Travel', 'plane'),
  ('Insurance', 'shield'),
  ('Subscriptions', 'repeat'),
  ('Reimbursement', 'receipt'),
  ('Investment', 'trending-up'),
  ('Other', 'tag')
) as v(name, icon)
where c.user_id is null and lower(c.name) = lower(v.name);

-- 2. Backfill every user's own copy from the matching template (so existing
--    users keep the defaults' icons without re-seeding).
update categories c
set icon = t.icon
from categories t
where c.user_id is not null
  and t.user_id is null
  and t.icon is not null
  and lower(c.name) = lower(t.name)
  and c.icon is null;

-- 3. New users' categories copy the template icon too.
create or replace function handle_new_user() returns trigger
  language plpgsql security definer
  as $$
  declare
    meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
    requested_country text := upper(trim(meta->>'country_code'));
    requested_currency text := upper(trim(meta->>'home_currency_code'));
  begin
    insert into public.profiles (id, display_name, country_code, home_currency_code)
    values (
      new.id,
      left(nullif(trim(meta->>'display_name'), ''), 80),
      case when requested_country ~ '^[A-Z]{2}$' then requested_country end,
      coalesce((select code from public.currencies where code = requested_currency), 'USD')
    );

    insert into public.categories (user_id, name, icon)
    select new.id, t.name, t.icon
    from (
      -- distinct-on guards against any stray duplicate template rows: the
      -- (user_id, lower(name)) unique index can't dedupe NULL user_ids.
      select distinct on (lower(name)) name, icon
      from public.categories
      where user_id is null
      order by lower(name)
    ) t;

    return new;
  end;
  $$;
