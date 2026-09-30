-- Receitas do portal voltam a sair título a título.
-- O plano de contas ganha o id da conta para abrir esses títulos.

drop function if exists public.portal_receitas(text, integer, integer, integer, integer);

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
    and coalesce(r.receita_valor, 0) > coalesce(r.receita_saldo, 0)
  order by
    rm.nome nulls first,
    s.nome nulls last,
    coalesce(r.receita_emissao, r.receita_competencia) desc nulls last,
    r.receita_id desc
  limit 1000;
$$;

revoke all on function public.portal_receitas(text, integer, integer, integer, integer) from public;
grant execute on function public.portal_receitas(text, integer, integer, integer, integer) to anon, authenticated;

drop function if exists public.portal_plano_contas(text, integer, integer, integer, integer);

create or replace function public.portal_plano_contas(
  p_slug text,
  p_ano integer default null,
  p_caixa integer default 0,
  p_secao integer default null,
  p_mes integer default null
)
returns table (
  lado text,
  plano_conta_id integer,
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
      c.plano_conta_id,
      c.codigo as plano_codigo,
      coalesce(c.nome, 'Sem conta') as plano_nome,
      null::text as fornecedor_nome,
      count(*)::integer as qtd,
      coalesce(sum(r.receita_valor - r.receita_saldo), 0) as total
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
      c.plano_conta_id,
      c.codigo as plano_codigo,
      coalesce(c.nome, 'Sem conta') as plano_nome,
      coalesce(f.fordespesa_nome, 'Sem fornecedor') as fornecedor_nome,
      count(*)::integer as qtd,
      coalesce(sum(d.despesa_valor - d.despesa_saldo), 0) as total
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
    x.plano_conta_id,
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

create or replace function public.portal_plano_titulos(
  p_slug text,
  p_ano integer default null,
  p_caixa integer default 0,
  p_secao integer default null,
  p_mes integer default null,
  p_lado text default 'receita',
  p_plano_conta_id integer default null
)
returns table (
  lancamento_id integer,
  emissao date,
  competencia date,
  descricao text,
  origem text,
  fornecedor_nome text,
  ramo_nome text,
  secao_nome text,
  valor numeric,
  saldo numeric,
  situacao integer,
  documento text
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
    coalesce(r.receita_emissao, r.receita_competencia),
    r.receita_competencia,
    r.receita_descricao::text,
    r.receita_origem::text,
    null::text,
    rm.nome::text,
    s.nome::text,
    r.receita_valor,
    r.receita_saldo,
    r.receita_situacao,
    r.receita_documento
  from public.receitas r
  left join public.ramos rm on rm.ramo_id = r.receita_ramo
  left join public.secao s on s.secao_id = r.receita_secao
  cross join bounds
  where p_lado = 'receita'
    and r.empresa_id = public.portal_resolve_empresa_id(p_slug)
    and (
      (p_plano_conta_id is null and r.plano_conta_id is null)
      or r.plano_conta_id = p_plano_conta_id
    )
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

  union all

  select
    d.despesa_id,
    d.despesa_emissao,
    null::date,
    d.despesa_finalidade::text,
    null::text,
    f.fordespesa_nome::text,
    rm.nome::text,
    s.nome::text,
    d.despesa_valor,
    d.despesa_saldo,
    d.despesa_situacao,
    d.despesa_documento
  from public.despesas d
  left join public.fornecedor_despesa f
    on f.fordespesa_id = d.despesa_fornecedor
  left join public.ramos rm on rm.ramo_id = d.despesa_ramo
  left join public.secao s on s.secao_id = d.despesa_secao
  cross join bounds
  where p_lado = 'despesa'
    and d.empresa_id = public.portal_resolve_empresa_id(p_slug)
    and (
      (p_plano_conta_id is null and f.plano_conta_id is null)
      or f.plano_conta_id = p_plano_conta_id
    )
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

  order by 2 desc nulls last, 1 desc;
$$;

revoke all on function public.portal_plano_titulos(text, integer, integer, integer, integer, text, integer) from public;
grant execute on function public.portal_plano_titulos(text, integer, integer, integer, integer, text, integer) to anon, authenticated;
