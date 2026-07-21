-- Portal: caixas (0=grupo, 1-4=ramos) + filtro por p_caixa

create or replace function public._portal_caixa_id(p_ramo integer)
returns integer
language sql
immutable
as $$
  select case
    when p_ramo in (1, 2, 3, 4) then p_ramo
    else 0
  end;
$$;

drop function if exists public.portal_resumo(text, integer);
drop function if exists public.portal_resumo(text, integer, integer);
drop function if exists public.portal_despesas(text, integer);
drop function if exists public.portal_despesas(text, integer, integer);
drop function if exists public.portal_receitas(text, integer);
drop function if exists public.portal_receitas(text, integer, integer);

create or replace function public.portal_resumo(
  p_slug text,
  p_ano integer default null,
  p_caixa integer default 0
)
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
      and public._portal_caixa_id(despesas.despesa_ramo) = coalesce(p_caixa, 0)
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
      and public._portal_caixa_id(receitas.receita_ramo) = coalesce(p_caixa, 0)
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

create or replace function public.portal_despesas(
  p_slug text,
  p_ano integer default null,
  p_caixa integer default 0
)
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
    and public._portal_caixa_id(d.despesa_ramo) = coalesce(p_caixa, 0)
    and (
      p_ano is null
      or extract(year from d.despesa_emissao)::integer = p_ano
    )
  order by d.despesa_emissao desc nulls last, d.despesa_id desc
  limit 1000;
$$;

create or replace function public.portal_receitas(
  p_slug text,
  p_ano integer default null,
  p_caixa integer default 0
)
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
    and public._portal_caixa_id(r.receita_ramo) = coalesce(p_caixa, 0)
    and (
      p_ano is null
      or extract(year from coalesce(r.receita_emissao, r.receita_competencia))::integer = p_ano
    )
  order by coalesce(r.receita_emissao, r.receita_competencia) desc nulls last, r.receita_id desc
  limit 1000;
$$;

grant execute on function public._portal_caixa_id(integer) to anon, authenticated;
grant execute on function public.portal_resumo(text, integer, integer) to anon, authenticated;
grant execute on function public.portal_despesas(text, integer, integer) to anon, authenticated;
grant execute on function public.portal_receitas(text, integer, integer) to anon, authenticated;
