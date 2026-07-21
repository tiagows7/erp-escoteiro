-- Aniversariantes do mes no dashboard

create or replace function public.dashboard_aniversariantes_mes(
  p_mes integer default null
)
returns table (
  associado_id integer,
  nome text,
  registro integer,
  data_nascimento date,
  dia integer,
  idade integer,
  ramo_nome text,
  secao_nome text,
  eh_hoje boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select coalesce(
      nullif(p_mes, 0),
      extract(month from current_date)::integer
    ) as mes
  )
  select
    a.associado_id,
    a.nome::text,
    a.registro,
    a.data_nascimento,
    extract(day from a.data_nascimento)::integer as dia,
    (
      extract(year from current_date)::integer
      - extract(year from a.data_nascimento)::integer
    ) as idade,
    r.nome::text as ramo_nome,
    s.nome::text as secao_nome,
    (
      extract(month from a.data_nascimento)::integer
        = extract(month from current_date)::integer
      and extract(day from a.data_nascimento)::integer
        = extract(day from current_date)::integer
    ) as eh_hoje
  from public.associados a
  cross join params p
  left join public.ramos r on r.ramo_id = a.ramo
  left join public.secao s on s.secao_id = a.secao
  where a.empresa_id = public.current_empresa_id()
    and coalesce(a.ativo, true) = true
    and a.data_nascimento is not null
    and extract(month from a.data_nascimento)::integer = p.mes
  order by
    extract(day from a.data_nascimento)::integer,
    a.nome;
$$;

grant execute on function public.dashboard_aniversariantes_mes(integer) to authenticated;
