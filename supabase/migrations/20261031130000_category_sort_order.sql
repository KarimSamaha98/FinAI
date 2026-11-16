-- Users choose the order their categories appear in (Settings → Categories,
-- drag to arrange). Pickers and the categorize deck follow sort_order.

alter table categories add column sort_order integer not null default 0;

-- Starting order: alphabetical, with "Other" last as the catch-all — per
-- user, and for the global template rows (user_id is null).
update categories c
set sort_order = o.rn
from (
  select id,
         row_number() over (
           partition by user_id
           order by (lower(name) = 'other'), lower(name)
         ) as rn
  from categories
) o
where c.id = o.id;

-- New users' categories copy the template order.
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

    insert into public.categories (user_id, name, icon, sort_order)
    select new.id, t.name, t.icon, t.sort_order
    from (
      -- distinct-on guards against any stray duplicate template rows: the
      -- (user_id, lower(name)) unique index can't dedupe NULL user_ids.
      select distinct on (lower(name)) name, icon, sort_order
      from public.categories
      where user_id is null
      order by lower(name)
    ) t;

    return new;
  end;
  $$;
