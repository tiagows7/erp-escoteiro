-- No portal, receitas com plano de contas saem somadas por conta.
-- As sem conta continuam uma linha cada.

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
  receita_documento text,
  plano_conta_qtd integer
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
  base as (
    select
      r.receita_id,
      r.receita_emissao,
      r.receita_vencimento,
      r.receita_competencia,
      r.receita_descricao,
      r.receita_origem,
      r.receita_ramo,
      rm.nome as ramo_nome,
      r.receita_secao,
      s.nome as secao_nome,
      r.receita_valor,
      r.receita_saldo,
      r.receita_situacao,
      r.receita_documento,
      r.plano_conta_id,
      c.codigo as plano_codigo,
      c.nome as plano_nome
    from public.receitas r
    left join public.ramos rm on rm.ramo_id = r.receita_ramo
    left join public.secao s on s.secao_id = r.receita_secao
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
  ),
  linhas as (
    select
      0 as ord,
      b.plano_codigo as ord_codigo,
      null::date as ord_data,
      -b.plano_conta_id as receita_id,
      null::date as receita_emissao,
      null::date as receita_vencimento,
      null::date as receita_competencia,
      (b.plano_codigo || ' — ' || b.plano_nome)::text as receita_descricao,
      case
        when count(distinct b.receita_origem) = 1 then min(b.receita_origem)::text
        else null::text
      end as receita_origem,
      null::text as ramo_nome,
      null::integer as secao_id,
      null::text as secao_nome,
      sum(b.receita_valor) as receita_valor,
      sum(b.receita_saldo) as receita_saldo,
      case
        when coalesce(sum(b.receita_saldo), 0) <= 0 then 3
        when coalesce(sum(b.receita_saldo), 0) < coalesce(sum(b.receita_valor), 0) then 2
        else 1
      end as receita_situacao,
      null::text as receita_documento,
      count(*)::integer as plano_conta_qtd
    from base b
    where b.plano_conta_id is not null
    group by b.plano_conta_id, b.plano_codigo, b.plano_nome

    union all

    select
      1,
      null::text,
      coalesce(b.receita_emissao, b.receita_competencia),
      b.receita_id,
      b.receita_emissao,
      b.receita_vencimento,
      b.receita_competencia,
      b.receita_descricao::text,
      b.receita_origem::text,
      b.ramo_nome::text,
      b.receita_secao,
      b.secao_nome::text,
      b.receita_valor,
      b.receita_saldo,
      b.receita_situacao,
      b.receita_documento,
      1
    from base b
    where b.plano_conta_id is null
  )
  select
    l.receita_id,
    l.receita_emissao,
    l.receita_vencimento,
    l.receita_competencia,
    l.receita_descricao,
    l.receita_origem,
    l.ramo_nome,
    l.secao_id,
    l.secao_nome,
    l.receita_valor,
    l.receita_saldo,
    l.receita_situacao,
    l.receita_documento,
    l.plano_conta_qtd
  from linhas l
  order by
    l.ord,
    l.ord_codigo nulls last,
    l.ord_data desc nulls last,
    l.receita_id desc
  limit 1000;
$$;

revoke all on function public.portal_receitas(text, integer, integer, integer, integer) from public;
grant execute on function public.portal_receitas(text, integer, integer, integer, integer) to anon, authenticated;
