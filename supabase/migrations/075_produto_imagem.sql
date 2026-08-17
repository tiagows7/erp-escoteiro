-- Foto do produto para loja local / online

alter table public.produto
  add column if not exists imagem_url text;

comment on column public.produto.imagem_url is
  'URL pública da foto do produto (loja local e online)';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'produtos',
  'produtos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "produtos_img_public_read" on storage.objects;
create policy "produtos_img_public_read"
  on storage.objects
  for select
  using (bucket_id = 'produtos');

drop policy if exists "produtos_img_tenant_insert" on storage.objects;
create policy "produtos_img_tenant_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'produtos'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  );

drop policy if exists "produtos_img_tenant_update" on storage.objects;
create policy "produtos_img_tenant_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'produtos'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  )
  with check (
    bucket_id = 'produtos'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  );

drop policy if exists "produtos_img_tenant_delete" on storage.objects;
create policy "produtos_img_tenant_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'produtos'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  );
