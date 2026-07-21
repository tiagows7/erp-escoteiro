-- Comprovante de receita + exposicao no portal da transparencia

alter table public.receitas
  add column if not exists receita_documento text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receita-comprovantes',
  'receita-comprovantes',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "receita_comprovantes_public_read" on storage.objects;
create policy "receita_comprovantes_public_read"
  on storage.objects
  for select
  using (bucket_id = 'receita-comprovantes');

drop policy if exists "receita_comprovantes_tenant_insert" on storage.objects;
create policy "receita_comprovantes_tenant_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'receita-comprovantes'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  );

drop policy if exists "receita_comprovantes_tenant_update" on storage.objects;
create policy "receita_comprovantes_tenant_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'receita-comprovantes'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  )
  with check (
    bucket_id = 'receita-comprovantes'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  );

drop policy if exists "receita_comprovantes_tenant_delete" on storage.objects;
create policy "receita_comprovantes_tenant_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'receita-comprovantes'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  );

drop function if exists public.portal_receitas(text, integer);
drop function if exists public.portal_despesas(text, integer);

create or replace function public.portal_receitas(p_slug text, p_ano integer default null)
returns table (
  receita_id integer,
  receita_emissao date,
  receita_vencimento date,
  receita_competencia date,
  receita_descricao text,
  receita_origem text,
  receita_valor numeric,
  receita_saldo numeric,
  receita_situacao integer,
  receita_documento text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.receita_id,
    r.receita_emissao,
    r.receita_vencimento,
    r.receita_competencia,
    r.receita_descricao::text,
    r.receita_origem::text,
    r.receita_valor,
    r.receita_saldo,
    r.receita_situacao,
    r.receita_documento
  from public.receitas r
  where r.empresa_id = public.portal_resolve_empresa_id(p_slug)
    and (
      p_ano is null
      or extract(year from coalesce(r.receita_emissao, r.receita_competencia))::integer = p_ano
    )
  order by coalesce(r.receita_emissao, r.receita_competencia) desc nulls last, r.receita_id desc
  limit 1000;
$$;

create or replace function public.portal_despesas(p_slug text, p_ano integer default null)
returns table (
  despesa_id integer,
  despesa_emissao date,
  despesa_vencimento date,
  despesa_finalidade text,
  fornecedor_nome text,
  ramo_nome text,
  despesa_valor numeric,
  despesa_saldo numeric,
  despesa_situacao integer,
  despesa_documento text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.despesa_id,
    d.despesa_emissao,
    d.despesa_vencimento,
    d.despesa_finalidade::text,
    f.fordespesa_nome::text,
    r.nome::text,
    d.despesa_valor,
    d.despesa_saldo,
    d.despesa_situacao,
    d.despesa_documento
  from public.despesas d
  left join public.fornecedor_despesa f on f.fordespesa_id = d.despesa_fornecedor
  left join public.ramos r on r.ramo_id = d.despesa_ramo
  where d.empresa_id = public.portal_resolve_empresa_id(p_slug)
    and (
      p_ano is null
      or extract(year from d.despesa_emissao)::integer = p_ano
    )
  order by d.despesa_emissao desc nulls last, d.despesa_id desc
  limit 1000;
$$;

revoke all on function public.portal_receitas(text, integer) from public;
revoke all on function public.portal_despesas(text, integer) from public;
grant execute on function public.portal_receitas(text, integer) to anon, authenticated;
grant execute on function public.portal_despesas(text, integer) to anon, authenticated;
