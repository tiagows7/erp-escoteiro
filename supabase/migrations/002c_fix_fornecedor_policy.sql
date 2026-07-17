-- Finalize a migration 002 (erro da policy duplicada)
-- Rode só este arquivo no SQL Editor.

drop policy if exists "fornecedor_tenant" on public.fornecedor_despesa;
drop policy if exists "fornecedor_despesa_tenant" on public.fornecedor_despesa;

create policy "fornecedor_despesa_tenant"
  on public.fornecedor_despesa
  for all
  to authenticated
  using (
    public.is_super_admin()
    or empresa_id = public.current_empresa_id()
  )
  with check (
    public.is_super_admin()
    or empresa_id = public.current_empresa_id()
  );

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_group_admin() to authenticated;
grant execute on function public.can_access_empresa(integer) to authenticated;

create or replace view public.me as
select
  p.id,
  p.nome,
  p.username,
  p.role,
  p.ativo,
  p.empresa_id,
  p.codigo_ramo,
  p.codigo_secao,
  p.codigo_secao_nome,
  e.nome as empresa_nome,
  e.slug as empresa_slug,
  e.ativo as empresa_ativa
from public.profiles p
left join public.empresa e on e.id = p.empresa_id
where p.id = auth.uid();

grant select on public.me to authenticated;

update public.profiles
set role = 'super_admin',
    tipo = 'S',
    ativo = true
where id = 'df58d56f-12ba-4871-8d6f-74b78737cf97';
