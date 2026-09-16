-- Private bucket for raw uploaded CSV/XLSX import files, retained for
-- audit/re-import per the uploaded_files table. Objects are keyed as
-- '{user_id}/{uploaded_file_id}-{original_filename}'. The Nest API uploads
-- using the service-role key (bypasses RLS), but these policies are still
-- defense-in-depth for any future direct-from-browser access — Supabase
-- Storage requests go through Supabase's own API/GoTrue, so auth.uid()
-- works here (unlike RLS on our own tables, which the API reaches via a
-- direct Postgres connection and must key off current_app_user_id()
-- instead).

insert into storage.buckets (id, name, public)
values ('imports', 'imports', false)
on conflict (id) do nothing;

create policy imports_select_own on storage.objects
  for select using (bucket_id = 'imports' and (storage.foldername(name))[1] = auth.uid()::text);

create policy imports_insert_own on storage.objects
  for insert with check (bucket_id = 'imports' and (storage.foldername(name))[1] = auth.uid()::text);

create policy imports_delete_own on storage.objects
  for delete using (bucket_id = 'imports' and (storage.foldername(name))[1] = auth.uid()::text);
