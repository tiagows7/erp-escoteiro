-- Regimento interno: PDF no storage (em vez de texto livre).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'empresa-regimento',
  'empresa-regimento',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Limpa textos livres antigos (refs bucket:path começam com empresa-regimento:).
update public.empresa
set regimento_interno = null
where regimento_interno is not null
  and regimento_interno !~ '^empresa-regimento:';

comment on column public.empresa.regimento_interno is
  'Ref do PDF do regimento (empresa-regimento:{empresa_id}/regimento.pdf).';

drop policy if exists "empresa_regimento_tenant_select" on storage.objects;
create policy "empresa_regimento_tenant_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'empresa-regimento'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  );

drop policy if exists "empresa_regimento_tenant_insert" on storage.objects;
create policy "empresa_regimento_tenant_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'empresa-regimento'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  );

drop policy if exists "empresa_regimento_tenant_update" on storage.objects;
create policy "empresa_regimento_tenant_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'empresa-regimento'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  )
  with check (
    bucket_id = 'empresa-regimento'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  );

drop policy if exists "empresa_regimento_tenant_delete" on storage.objects;
create policy "empresa_regimento_tenant_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'empresa-regimento'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  );
