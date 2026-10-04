-- Categories become per-user: each user owns their own copy of the default
-- set, seeded at signup from the global template rows (user_id IS NULL), so
-- they can rename/add/archive freely without affecting anyone else. Adds soft
-- delete too: an archived category leaves the pickers but stays attached to
-- the historical transactions that used it.

-- 1. Soft-delete flag.
alter table categories add column is_archived boolean not null default false;

-- 2. Uniqueness only among active rows, so a name can be reused after archiving.
drop index categories_user_lower_name_key;
create unique index categories_user_lower_name_key
  on categories (user_id, lower(name))
  where is_archived = false;

-- 3. Give every existing user their own copy of the global defaults.
insert into categories (user_id, name)
select u.id, template.name
from auth.users u
cross join categories template
where template.user_id is null
on conflict do nothing;

-- 4. Re-point existing transactions from the global template rows to the
--    user's own copy (matched by name), so nothing loses its category.
update transactions t
set category_id = own.id
from categories template, categories own
where t.category_id = template.id
  and template.user_id is null
  and own.user_id = t.user_id
  and lower(own.name) = lower(template.name);

-- 5. Seed the defaults for every new user at signup. Profile logic is
--    unchanged from 20261004120000_profile_country_and_avatar.sql.
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

    insert into public.categories (user_id, name)
    select new.id, t.name
    from (
      -- distinct-on guards against any stray duplicate template rows: the
      -- (user_id, lower(name)) unique index can't dedupe NULL user_ids.
      select distinct on (lower(name)) name
      from public.categories
      where user_id is null
      order by lower(name)
    ) t;

    return new;
  end;
  $$;

-- 6. A user now only sees their own categories; the global rows remain purely
--    as the signup template, read by the security-definer trigger above.
drop policy categories_select on categories;
create policy categories_select on categories
  for select using (user_id = current_app_user_id());
