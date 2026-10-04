-- Each account renders as a card. Its look is a colour (always set) plus an
-- optional uploaded photo of the physical card; when a photo exists the UI
-- shows it and the colour is the fallback. Palette below must stay in sync
-- with CARD_COLOR_PALETTE in packages/shared-types/src/account.ts.

alter table accounts
  add column card_color text not null default '#4f46e5' check (card_color ~ '^#[0-9a-f]{6}$'),
  add column card_image_path text;

-- Give existing accounts distinct palette colours (per user, oldest first)
-- instead of all sharing the column default.
with palette(colors) as (
  select array['#4f46e5', '#0f766e', '#be123c', '#1d4ed8', '#b45309', '#7c3aed', '#15803d', '#334155']
),
ranked as (
  select id, row_number() over (partition by user_id order by created_at, id) - 1 as idx
  from accounts
)
update accounts a
set card_color = palette.colors[(ranked.idx % 8) + 1]
from ranked, palette
where a.id = ranked.id;

-- Private bucket for card photos, keyed '{user_id}/{file}'. Served through
-- short-lived signed URLs minted by the API, like avatars.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('account-cards', 'account-cards', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy account_cards_select_own on storage.objects
  for select using (bucket_id = 'account-cards' and (storage.foldername(name))[1] = auth.uid()::text);

create policy account_cards_insert_own on storage.objects
  for insert with check (bucket_id = 'account-cards' and (storage.foldername(name))[1] = auth.uid()::text);

create policy account_cards_delete_own on storage.objects
  for delete using (bucket_id = 'account-cards' and (storage.foldername(name))[1] = auth.uid()::text);
