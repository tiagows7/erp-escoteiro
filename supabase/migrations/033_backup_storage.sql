-- Bucket privado para backups lógicos gerados pelo app (super_admin)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'backups',
  'backups',
  false,
  52428800, -- 50 MB
  array['application/json', 'application/gzip', 'text/plain']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "backups_super_admin_select" on storage.objects;
create policy "backups_super_admin_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'backups'
    and public.is_super_admin()
  );

drop policy if exists "backups_super_admin_insert" on storage.objects;
create policy "backups_super_admin_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'backups'
    and public.is_super_admin()
  );

drop policy if exists "backups_super_admin_update" on storage.objects;
create policy "backups_super_admin_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'backups'
    and public.is_super_admin()
  )
  with check (
    bucket_id = 'backups'
    and public.is_super_admin()
  );

drop policy if exists "backups_super_admin_delete" on storage.objects;
create policy "backups_super_admin_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'backups'
    and public.is_super_admin()
  );
