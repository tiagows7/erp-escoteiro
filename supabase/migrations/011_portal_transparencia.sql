-- Portal da Transparência (público por slug do grupo)
-- Expõe despesas e receitas via funções SECURITY DEFINER (sem abrir RLS das tabelas).

alter table public.empresa
  add column if not exists portal_transparencia boolean not null default true;

comment on column public.empresa.portal_transparencia is
  'Se true, o portal público /transparencia/:slug fica disponível.';

create or replace function public.portal_resolve_empresa_id(p_slug text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select e.id
  from public.empresa e
  where e.slug = lower(trim(p_slug))
    and coalesce(e.ativo, true) = true
    and e.portal_transparencia = true
  limit 1;
$$;

create or replace function public.portal_grupo_info(p_slug text)
returns table (
  id integer,
  nome text,
  slug text,
  logo_url text,
  telefone text,
  email text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.nome::text,
    e.slug::text,
    e.logo_url,
    e.telefone::text,
    e.email::text
  from public.empresa e
  where e.id = public.portal_resolve_empresa_id(p_slug);
$$;

create or replace function public.portal_resumo(p_slug text, p_ano integer default null)
returns table (
  total_despesas numeric,
  total_receitas numeric,
  despesas_pagas numeric,
  receitas_recebidas numeric,
  saldo_lancado numeric,
  saldo_realizado numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with emp as (
    select public.portal_resolve_empresa_id(p_slug) as empresa_id
  ),
  d as (
    select
      coalesce(sum(despesa_valor), 0)::numeric as total,
      coalesce(sum(despesa_valor - despesa_saldo), 0)::numeric as pago
    from public.despesas, emp
    where despesas.empresa_id = emp.empresa_id
      and emp.empresa_id is not null
      and (
        p_ano is null
        or extract(year from despesas.despesa_emissao)::integer = p_ano
      )
  ),
  r as (
    select
      coalesce(sum(receita_valor), 0)::numeric as total,
      coalesce(sum(receita_valor - receita_saldo), 0)::numeric as recebido
    from public.receitas, emp
    where receitas.empresa_id = emp.empresa_id
      and emp.empresa_id is not null
      and (
        p_ano is null
        or extract(year from coalesce(receitas.receita_emissao, receitas.receita_competencia))::integer = p_ano
      )
  )
  select
    d.total as total_despesas,
    r.total as total_receitas,
    d.pago as despesas_pagas,
    r.recebido as receitas_recebidas,
    (r.total - d.total)::numeric as saldo_lancado,
    (r.recebido - d.pago)::numeric as saldo_realizado
  from d, r, emp
  where emp.empresa_id is not null;
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
  despesa_situacao integer
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
    d.despesa_situacao
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
  receita_situacao integer
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
    r.receita_situacao
  from public.receitas r
  where r.empresa_id = public.portal_resolve_empresa_id(p_slug)
    and (
      p_ano is null
      or extract(year from coalesce(r.receita_emissao, r.receita_competencia))::integer = p_ano
    )
  order by coalesce(r.receita_emissao, r.receita_competencia) desc nulls last, r.receita_id desc
  limit 1000;
$$;

revoke all on function public.portal_resolve_empresa_id(text) from public;
revoke all on function public.portal_grupo_info(text) from public;
revoke all on function public.portal_resumo(text, integer) from public;
revoke all on function public.portal_despesas(text, integer) from public;
revoke all on function public.portal_receitas(text, integer) from public;

grant execute on function public.portal_grupo_info(text) to anon, authenticated;
grant execute on function public.portal_resumo(text, integer) to anon, authenticated;
grant execute on function public.portal_despesas(text, integer) to anon, authenticated;
grant execute on function public.portal_receitas(text, integer) to anon, authenticated;
