-- Bucket público para logos dos grupos escoteiros
-- Rode no SQL Editor do Supabase (ou via CLI)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'grupo-logos',
  'grupo-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "grupo_logos_public_read" on storage.objects;
create policy "grupo_logos_public_read"
  on storage.objects
  for select
  using (bucket_id = 'grupo-logos');

drop policy if exists "grupo_logos_super_admin_insert" on storage.objects;
create policy "grupo_logos_super_admin_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'grupo-logos'
    and public.is_super_admin()
  );

drop policy if exists "grupo_logos_super_admin_update" on storage.objects;
create policy "grupo_logos_super_admin_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'grupo-logos'
    and public.is_super_admin()
  )
  with check (
    bucket_id = 'grupo-logos'
    and public.is_super_admin()
  );

drop policy if exists "grupo_logos_super_admin_delete" on storage.objects;
create policy "grupo_logos_super_admin_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'grupo-logos'
    and public.is_super_admin()
  );
