-- Saldo anterior e saldo final do portal voltam a ser só o caixa
-- (recebido − pago), sem o saldo dos locais.

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
