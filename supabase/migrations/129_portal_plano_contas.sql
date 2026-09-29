-- Visão do portal por plano de contas: receitas somadas por conta
-- e despesas somadas por fornecedor dentro de cada conta.

create or replace function public.portal_plano_contas(
  p_slug text,
  p_ano integer default null,
  p_caixa integer default 0,
  p_secao integer default null,
  p_mes integer default null
)
returns table (
  lado text,
  plano_codigo text,
  plano_nome text,
  fornecedor_nome text,
  qtd integer,
  total numeric
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
  ),
  receitas_conta as (
    select
      'receita'::text as lado,
      c.codigo as plano_codigo,
      coalesce(c.nome, 'Sem conta') as plano_nome,
      null::text as fornecedor_nome,
      count(*)::integer as qtd,
      coalesce(sum(r.receita_valor - r.receita_saldo), 0) as total,
      c.plano_conta_id
    from public.receitas r
    left join public.plano_contas c
      on c.plano_conta_id = r.plano_conta_id
     and c.empresa_id = r.empresa_id
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
      and coalesce(r.receita_valor, 0) > coalesce(r.receita_saldo, 0)
    group by c.plano_conta_id, c.codigo, c.nome
  ),
  despesas_conta as (
    select
      'despesa'::text as lado,
      c.codigo as plano_codigo,
      coalesce(c.nome, 'Sem conta') as plano_nome,
      coalesce(f.fordespesa_nome, 'Sem fornecedor') as fornecedor_nome,
      count(*)::integer as qtd,
      coalesce(sum(d.despesa_valor - d.despesa_saldo), 0) as total,
      c.plano_conta_id
    from public.despesas d
    left join public.fornecedor_despesa f
      on f.fordespesa_id = d.despesa_fornecedor
    left join public.plano_contas c
      on c.plano_conta_id = f.plano_conta_id
     and c.empresa_id = d.empresa_id
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
      and coalesce(d.despesa_valor, 0) > coalesce(d.despesa_saldo, 0)
    group by c.plano_conta_id, c.codigo, c.nome, f.fordespesa_id, f.fordespesa_nome
  )
  select
    x.lado,
    x.plano_codigo,
    x.plano_nome,
    x.fornecedor_nome,
    x.qtd,
    x.total
  from (
    select * from receitas_conta
    union all
    select * from despesas_conta
  ) x
  order by
    case when x.lado = 'receita' then 0 else 1 end,
    x.plano_codigo nulls last,
    x.plano_nome,
    x.fornecedor_nome nulls last;
$$;

revoke all on function public.portal_plano_contas(text, integer, integer, integer, integer) from public;
grant execute on function public.portal_plano_contas(text, integer, integer, integer, integer) to anon, authenticated;
