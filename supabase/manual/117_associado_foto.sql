-- Foto do associado (cadastro + voluntários)

alter table public.associados
  add column if not exists foto_url text;

comment on column public.associados.foto_url is
  'URL pública da foto do associado';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'associados',
  'associados',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "associados_img_public_read" on storage.objects;
create policy "associados_img_public_read"
  on storage.objects
  for select
  using (bucket_id = 'associados');

drop policy if exists "associados_img_tenant_insert" on storage.objects;
create policy "associados_img_tenant_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'associados'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  );

drop policy if exists "associados_img_tenant_update" on storage.objects;
create policy "associados_img_tenant_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'associados'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  )
  with check (
    bucket_id = 'associados'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  );

drop policy if exists "associados_img_tenant_delete" on storage.objects;
create policy "associados_img_tenant_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'associados'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  );
