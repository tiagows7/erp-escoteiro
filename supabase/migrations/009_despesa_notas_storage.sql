-- Storage para notas fiscais / comprovantes de despesas
-- Path: {empresa_id}/{despesa_id}/{arquivo}

alter table public.despesas
  alter column despesa_documento type text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'despesa-notas',
  'despesa-notas',
  true,
  5242880,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "despesa_notas_public_read" on storage.objects;
create policy "despesa_notas_public_read"
  on storage.objects
  for select
  using (bucket_id = 'despesa-notas');

drop policy if exists "despesa_notas_tenant_insert" on storage.objects;
create policy "despesa_notas_tenant_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'despesa-notas'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  );

drop policy if exists "despesa_notas_tenant_update" on storage.objects;
create policy "despesa_notas_tenant_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'despesa-notas'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  )
  with check (
    bucket_id = 'despesa-notas'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  );

drop policy if exists "despesa_notas_tenant_delete" on storage.objects;
create policy "despesa_notas_tenant_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'despesa-notas'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  );
