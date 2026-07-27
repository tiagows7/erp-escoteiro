-- Portal: separar por seção quando o ramo (caixa 1-4) tiver mais de uma seção.

drop function if exists public.portal_resumo(text, integer, integer);
drop function if exists public.portal_resumo(text, integer, integer, integer);
drop function if exists public.portal_despesas(text, integer, integer);
drop function if exists public.portal_despesas(text, integer, integer, integer);
drop function if exists public.portal_receitas(text, integer, integer);
drop function if exists public.portal_receitas(text, integer, integer, integer);
drop function if exists public.portal_secoes_caixa(text, integer);

create or replace function public.portal_secoes_caixa(
  p_slug text,
  p_caixa integer
)
returns table (
  secao_id integer,
  secao_nome text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.secao_id,
    s.nome::text as secao_nome
  from public.secao s
  where s.empresa_id = public.portal_resolve_empresa_id(p_slug)
    and coalesce(p_caixa, 0) between 1 and 4
    and s.ramo = p_caixa
  order by s.nome;
$$;

create or replace function public.portal_resumo(
  p_slug text,
  p_ano integer default null,
  p_caixa integer default 0,
  p_secao integer default null
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
        p_secao is null
        or despesas.despesa_secao = p_secao
      )
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
        p_secao is null
        or receitas.receita_secao = p_secao
      )
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
  p_caixa integer default 0,
  p_secao integer default null
)
returns table (
  despesa_id integer,
  despesa_emissao date,
  despesa_vencimento date,
  despesa_finalidade text,
  fornecedor_nome text,
  ramo_nome text,
  secao_id integer,
  secao_nome text,
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
    d.despesa_secao,
    s.nome::text,
    d.despesa_valor,
    d.despesa_saldo,
    d.despesa_situacao,
    d.despesa_documento
  from public.despesas d
  left join public.fornecedor_despesa f on f.fordespesa_id = d.despesa_fornecedor
  left join public.ramos r on r.ramo_id = d.despesa_ramo
  left join public.secao s on s.secao_id = d.despesa_secao
  where d.empresa_id = public.portal_resolve_empresa_id(p_slug)
    and public._portal_caixa_id(d.despesa_ramo) = coalesce(p_caixa, 0)
    and (
      p_secao is null
      or d.despesa_secao = p_secao
    )
    and (
      p_ano is null
      or extract(year from d.despesa_emissao)::integer = p_ano
    )
  order by
    s.nome nulls last,
    d.despesa_emissao desc nulls last,
    d.despesa_id desc
  limit 1000;
$$;

create or replace function public.portal_receitas(
  p_slug text,
  p_ano integer default null,
  p_caixa integer default 0,
  p_secao integer default null
)
returns table (
  receita_id integer,
  receita_emissao date,
  receita_vencimento date,
  receita_competencia date,
  receita_descricao text,
  receita_origem text,
  secao_id integer,
  secao_nome text,
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
    r.receita_secao,
    s.nome::text,
    r.receita_valor,
    r.receita_saldo,
    r.receita_situacao,
    r.receita_documento
  from public.receitas r
  left join public.secao s on s.secao_id = r.receita_secao
  where r.empresa_id = public.portal_resolve_empresa_id(p_slug)
    and public._portal_caixa_id(r.receita_ramo) = coalesce(p_caixa, 0)
    and (
      p_secao is null
      or r.receita_secao = p_secao
    )
    and (
      p_ano is null
      or extract(year from coalesce(r.receita_emissao, r.receita_competencia))::integer = p_ano
    )
  order by
    s.nome nulls last,
    coalesce(r.receita_emissao, r.receita_competencia) desc nulls last,
    r.receita_id desc
  limit 1000;
$$;

revoke all on function public.portal_secoes_caixa(text, integer) from public;
revoke all on function public.portal_resumo(text, integer, integer, integer) from public;
revoke all on function public.portal_despesas(text, integer, integer, integer) from public;
revoke all on function public.portal_receitas(text, integer, integer, integer) from public;

grant execute on function public.portal_secoes_caixa(text, integer) to anon, authenticated;
grant execute on function public.portal_resumo(text, integer, integer, integer) to anon, authenticated;
grant execute on function public.portal_despesas(text, integer, integer, integer) to anon, authenticated;
grant execute on function public.portal_receitas(text, integer, integer, integer) to anon, authenticated;
