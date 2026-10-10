-- Cada local de saldo passa a registrar a data daquele valor,
-- para o portal da transparência filtrar o período depois.

alter table public.empresa_saldo_local
  add column if not exists data_saldo date;

update public.empresa_saldo_local
   set data_saldo = (created_at at time zone 'America/Sao_Paulo')::date
 where data_saldo is null;

alter table public.empresa_saldo_local
  alter column data_saldo set not null;

comment on column public.empresa_saldo_local.data_saldo is
  'Data a que se refere o valor informado neste local.';

drop function if exists public.portal_saldo_locais(text, integer, integer);

create function public.portal_saldo_locais(
  p_slug text,
  p_caixa integer default 0,
  p_secao integer default null
)
returns table (
  id bigint,
  nome text,
  valor numeric,
  ordem integer,
  secao_id integer,
  secao_nome text,
  data_saldo date
)
language sql
stable
security definer
set search_path = public
as $$
  with emp as (
    select public.portal_resolve_empresa_id(p_slug) as empresa_id
  )
  select
    l.id,
    l.nome,
    l.valor,
    l.ordem,
    l.secao_id,
    s.nome as secao_nome,
    l.data_saldo
  from public.empresa_saldo_local l
  cross join emp
  left join public.secao s on s.secao_id = l.secao_id
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
  order by l.caixa_id, l.ordem, l.nome;
$$;

revoke all on function public.portal_saldo_locais(text, integer, integer) from public;
grant execute on function public.portal_saldo_locais(text, integer, integer) to anon, authenticated;
