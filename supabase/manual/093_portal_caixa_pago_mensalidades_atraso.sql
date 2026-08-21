-- Portal: demonstrativo em regime de caixa (só pago/recebido)
-- + total de mensalidades em atraso no resumo.
-- Listas de receitas/despesas: só títulos com valor já quitado (parcial ou total).

drop function if exists public.portal_resumo(text, integer, integer, integer, integer);

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
  saldo_final numeric,
  mensalidades_atraso numeric
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
      and (
        coalesce(p_caixa, 0) = -1
        or public._portal_caixa_id(despesas.despesa_ramo) = coalesce(p_caixa, 0)
      )
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
      and (
        coalesce(p_caixa, 0) = -1
        or public._portal_caixa_id(receitas.receita_ramo) = coalesce(p_caixa, 0)
      )
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
      and (
        coalesce(p_caixa, 0) = -1
        or public._portal_caixa_id(despesas.despesa_ramo) = coalesce(p_caixa, 0)
      )
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
      and (
        coalesce(p_caixa, 0) = -1
        or public._portal_caixa_id(receitas.receita_ramo) = coalesce(p_caixa, 0)
      )
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
  ),
  -- Mensalidades ficam no caixa do grupo (ramo null); em ramos/seções filtra pelo associado.
  atraso as (
    select coalesce(sum(rec.receita_saldo), 0)::numeric as total
    from public.receitas rec
    left join public.associados assoc on assoc.associado_id = rec.associado_id
    cross join emp
    where emp.empresa_id is not null
      and rec.empresa_id = emp.empresa_id
      and rec.receita_origem = 'M'
      and coalesce(rec.receita_saldo, 0) > 0
      and rec.receita_vencimento is not null
      and rec.receita_vencimento < current_date
      and (
        coalesce(p_caixa, 0) = -1
        or coalesce(p_caixa, 0) = 0
        or (
          coalesce(p_caixa, 0) between 1 and 4
          and assoc.ramo = coalesce(p_caixa, 0)
        )
      )
      and (
        p_secao is null
        or assoc.secao = p_secao
      )
  )
  select
    d.pago as total_despesas,
    r.recebido as total_receitas,
    d.pago as despesas_pagas,
    r.recebido as receitas_recebidas,
    (r.recebido - d.pago)::numeric as saldo_lancado,
    (r.recebido - d.pago)::numeric as saldo_realizado,
    (r_ant.recebido - d_ant.pago)::numeric as saldo_anterior,
    (
      (r_ant.recebido - d_ant.pago) + (r.recebido - d.pago)
    )::numeric as saldo_final,
    atraso.total as mensalidades_atraso
  from d, r, d_ant, r_ant, atraso, emp
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
    and (
      coalesce(p_caixa, 0) = -1
      or public._portal_caixa_id(d.despesa_ramo) = coalesce(p_caixa, 0)
    )
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
    -- Só o que já foi pago (parcial ou total)
    and coalesce(d.despesa_valor, 0) > coalesce(d.despesa_saldo, 0)
  order by
    r.nome nulls first,
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
  ramo_nome text,
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
    rm.nome::text,
    r.receita_secao,
    s.nome::text,
    r.receita_valor,
    r.receita_saldo,
    r.receita_situacao,
    r.receita_documento
  from public.receitas r
  left join public.ramos rm on rm.ramo_id = r.receita_ramo
  left join public.secao s on s.secao_id = r.receita_secao
  cross join bounds
  where r.empresa_id = public.portal_resolve_empresa_id(p_slug)
    and (
      coalesce(p_caixa, 0) = -1
      or public._portal_caixa_id(r.receita_ramo) = coalesce(p_caixa, 0)
    )
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
    -- Só o que já foi recebido (parcial ou total)
    and coalesce(r.receita_valor, 0) > coalesce(r.receita_saldo, 0)
  order by
    rm.nome nulls first,
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
