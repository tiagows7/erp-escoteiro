-- Portal: demonstrativo por ano/mês com saldo anterior e saldo final.

drop function if exists public.portal_resumo(text, integer, integer, integer);
drop function if exists public.portal_resumo(text, integer, integer, integer, integer);
drop function if exists public.portal_despesas(text, integer, integer, integer);
drop function if exists public.portal_despesas(text, integer, integer, integer, integer);
drop function if exists public.portal_receitas(text, integer, integer, integer);
drop function if exists public.portal_receitas(text, integer, integer, integer, integer);

create or replace function public.portal_resumo(
  p_slug text,
  p_ano integer default null,
  p_caixa integer default 0,
  p_secao integer default null,
  p_mes integer default null
)
returns table (
  total_despesas numeric,
  total_receitas numeric,
  despesas_pagas numeric,
  receitas_recebidas numeric,
  saldo_lancado numeric,
  saldo_realizado numeric,
  saldo_anterior numeric,
  saldo_final numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with emp as (
    select public.portal_resolve_empresa_id(p_slug) as empresa_id
  ),
  bounds as (
    select
      case
        when p_ano is null then null::date
        when p_mes is null or p_mes < 1 or p_mes > 12 then make_date(p_ano, 1, 1)
        else make_date(p_ano, p_mes, 1)
      end as periodo_inicio,
      case
        when p_ano is null then null::date
        when p_mes is null or p_mes < 1 or p_mes > 12 then make_date(p_ano + 1, 1, 1)
        when p_mes = 12 then make_date(p_ano + 1, 1, 1)
        else make_date(p_ano, p_mes + 1, 1)
      end as periodo_fim
  ),
  d_ant as (
    select
      coalesce(sum(despesa_valor), 0)::numeric as total,
      coalesce(sum(despesa_valor - despesa_saldo), 0)::numeric as pago
    from public.despesas, emp, bounds
    where despesas.empresa_id = emp.empresa_id
      and emp.empresa_id is not null
      and public._portal_caixa_id(despesas.despesa_ramo) = coalesce(p_caixa, 0)
      and (
        p_secao is null
        or despesas.despesa_secao = p_secao
      )
      and bounds.periodo_inicio is not null
      and despesas.despesa_emissao is not null
      and despesas.despesa_emissao < bounds.periodo_inicio
  ),
  r_ant as (
    select
      coalesce(sum(receita_valor), 0)::numeric as total,
      coalesce(sum(receita_valor - receita_saldo), 0)::numeric as recebido
    from public.receitas, emp, bounds
    where receitas.empresa_id = emp.empresa_id
      and emp.empresa_id is not null
      and public._portal_caixa_id(receitas.receita_ramo) = coalesce(p_caixa, 0)
      and (
        p_secao is null
        or receitas.receita_secao = p_secao
      )
      and bounds.periodo_inicio is not null
      and coalesce(receitas.receita_emissao, receitas.receita_competencia) is not null
      and coalesce(receitas.receita_emissao, receitas.receita_competencia)
        < bounds.periodo_inicio
  ),
  d as (
    select
      coalesce(sum(despesa_valor), 0)::numeric as total,
      coalesce(sum(despesa_valor - despesa_saldo), 0)::numeric as pago
    from public.despesas, emp, bounds
    where despesas.empresa_id = emp.empresa_id
      and emp.empresa_id is not null
      and public._portal_caixa_id(despesas.despesa_ramo) = coalesce(p_caixa, 0)
      and (
        p_secao is null
        or despesas.despesa_secao = p_secao
      )
      and (
        bounds.periodo_inicio is null
        or (
          despesas.despesa_emissao >= bounds.periodo_inicio
          and despesas.despesa_emissao < bounds.periodo_fim
        )
      )
  ),
  r as (
    select
      coalesce(sum(receita_valor), 0)::numeric as total,
      coalesce(sum(receita_valor - receita_saldo), 0)::numeric as recebido
    from public.receitas, emp, bounds
    where receitas.empresa_id = emp.empresa_id
      and emp.empresa_id is not null
      and public._portal_caixa_id(receitas.receita_ramo) = coalesce(p_caixa, 0)
      and (
        p_secao is null
        or receitas.receita_secao = p_secao
      )
      and (
        bounds.periodo_inicio is null
        or (
          coalesce(receitas.receita_emissao, receitas.receita_competencia)
            >= bounds.periodo_inicio
          and coalesce(receitas.receita_emissao, receitas.receita_competencia)
            < bounds.periodo_fim
        )
      )
  )
  select
    d.total as total_despesas,
    r.total as total_receitas,
    d.pago as despesas_pagas,
    r.recebido as receitas_recebidas,
    (r.total - d.total)::numeric as saldo_lancado,
    (r.recebido - d.pago)::numeric as saldo_realizado,
    (r_ant.total - d_ant.total)::numeric as saldo_anterior,
    ((r_ant.total - d_ant.total) + (r.total - d.total))::numeric as saldo_final
  from d, r, d_ant, r_ant, emp
  where emp.empresa_id is not null;
$$;

create or replace function public.portal_despesas(
  p_slug text,
  p_ano integer default null,
  p_caixa integer default 0,
  p_secao integer default null,
  p_mes integer default null
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
  with bounds as (
    select
      case
        when p_ano is null then null::date
        when p_mes is null or p_mes < 1 or p_mes > 12 then make_date(p_ano, 1, 1)
        else make_date(p_ano, p_mes, 1)
      end as periodo_inicio,
      case
        when p_ano is null then null::date
        when p_mes is null or p_mes < 1 or p_mes > 12 then make_date(p_ano + 1, 1, 1)
        when p_mes = 12 then make_date(p_ano + 1, 1, 1)
        else make_date(p_ano, p_mes + 1, 1)
      end as periodo_fim
  )
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
  cross join bounds
  where d.empresa_id = public.portal_resolve_empresa_id(p_slug)
    and public._portal_caixa_id(d.despesa_ramo) = coalesce(p_caixa, 0)
    and (
      p_secao is null
      or d.despesa_secao = p_secao
    )
    and (
      bounds.periodo_inicio is null
      or (
        d.despesa_emissao >= bounds.periodo_inicio
        and d.despesa_emissao < bounds.periodo_fim
      )
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
  p_secao integer default null,
  p_mes integer default null
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
  with bounds as (
    select
      case
        when p_ano is null then null::date
        when p_mes is null or p_mes < 1 or p_mes > 12 then make_date(p_ano, 1, 1)
        else make_date(p_ano, p_mes, 1)
      end as periodo_inicio,
      case
        when p_ano is null then null::date
        when p_mes is null or p_mes < 1 or p_mes > 12 then make_date(p_ano + 1, 1, 1)
        when p_mes = 12 then make_date(p_ano + 1, 1, 1)
        else make_date(p_ano, p_mes + 1, 1)
      end as periodo_fim
  )
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
  cross join bounds
  where r.empresa_id = public.portal_resolve_empresa_id(p_slug)
    and public._portal_caixa_id(r.receita_ramo) = coalesce(p_caixa, 0)
    and (
      p_secao is null
      or r.receita_secao = p_secao
    )
    and (
      bounds.periodo_inicio is null
      or (
        coalesce(r.receita_emissao, r.receita_competencia) >= bounds.periodo_inicio
        and coalesce(r.receita_emissao, r.receita_competencia) < bounds.periodo_fim
      )
    )
  order by
    s.nome nulls last,
    coalesce(r.receita_emissao, r.receita_competencia) desc nulls last,
    r.receita_id desc
  limit 1000;
$$;

revoke all on function public.portal_resumo(text, integer, integer, integer, integer) from public;
revoke all on function public.portal_despesas(text, integer, integer, integer, integer) from public;
revoke all on function public.portal_receitas(text, integer, integer, integer, integer) from public;

grant execute on function public.portal_resumo(text, integer, integer, integer, integer) to anon, authenticated;
grant execute on function public.portal_despesas(text, integer, integer, integer, integer) to anon, authenticated;
grant execute on function public.portal_receitas(text, integer, integer, integer, integer) to anon, authenticated;
