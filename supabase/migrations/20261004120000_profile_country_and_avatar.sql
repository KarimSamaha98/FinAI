-- Sign-up now collects a name, country, home currency and optional profile
-- photo. Name/country/currency travel as Supabase Auth user metadata on
-- signUp() and are copied into profiles here, so the row is complete even
-- when email confirmation means the client has no session yet. The photo is
-- uploaded afterwards through the API (POST /api/users/me/avatar).

alter table profiles
  add column country_code text check (country_code ~ '^[A-Z]{2}$'),
  add column avatar_path text;

-- Metadata is client-supplied, so each value is validated and anything bad
-- falls back to the old defaults rather than failing the sign-up.
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
    return new;
  end;
  $$;

-- Private bucket for profile photos, keyed '{user_id}/{file}'. Served to the
-- owner through short-lived signed URLs minted by the API.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy avatars_select_own on storage.objects
  for select using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_insert_own on storage.objects
  for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_delete_own on storage.objects
  for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
