-- Movimentos dos locais de saldo no portal da transparência.

create or replace function public.portal_saldo_movimentos(
  p_slug text,
  p_ano integer,
  p_caixa integer default 0,
  p_secao integer default null,
  p_mes integer default null
)
returns table (
  local_id bigint,
  local_nome text,
  local_valor numeric,
  secao_nome text,
  ordem integer,
  movimento_id bigint,
  data_movimento date,
  saldo_anterior numeric,
  valor_aplicado numeric,
  valor_resgatado numeric,
  valor_creditos numeric,
  valor_debitos numeric,
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
  periodo as (
    select
      case
        when p_mes is null or p_mes < 1 or p_mes > 12 then make_date(p_ano, 1, 1)
        else make_date(p_ano, p_mes, 1)
      end as inicio,
      case
        when p_mes is null or p_mes < 1 or p_mes > 12 then make_date(p_ano + 1, 1, 1)
        when p_mes = 12 then make_date(p_ano + 1, 1, 1)
        else make_date(p_ano, p_mes + 1, 1)
      end as fim
  )
  select
    l.id as local_id,
    l.nome as local_nome,
    l.valor as local_valor,
    s.nome as secao_nome,
    l.ordem,
    m.id as movimento_id,
    m.data_movimento,
    m.saldo_anterior,
    m.valor_aplicado,
    m.valor_resgatado,
    m.valor_creditos,
    m.valor_debitos,
    m.saldo_final
  from public.empresa_saldo_local l
  cross join emp
  cross join periodo
  left join public.secao s on s.secao_id = l.secao_id
  left join public.empresa_saldo_local_movimento m
    on m.local_id = l.id
   and m.empresa_id = l.empresa_id
   and m.data_movimento >= periodo.inicio
   and m.data_movimento < periodo.fim
  where emp.empresa_id is not null
    and l.empresa_id = emp.empresa_id
    and l.ativo = true
    and (
      coalesce(p_caixa, 0) = -1
      or l.caixa_id = coalesce(p_caixa, 0)
    )
    and (
      p_secao is null
      or l.secao_id is null
      or l.secao_id = p_secao
    )
  order by l.ordem, l.nome, m.data_movimento;
$$;

revoke all on function public.portal_saldo_movimentos(text, integer, integer, integer, integer) from public;
grant execute on function public.portal_saldo_movimentos(text, integer, integer, integer, integer) to anon, authenticated;
