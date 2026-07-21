-- Passagens de ramo
-- Limites superiores (em meses totais):
--   Lobinho   10a6m (126)
--   Escoteiro 14a6m (174)  — chegada a partir de 10a6m
--   Sênior    17a6m (210)  — chegada a partir de 14a6m
--   Pioneiro  21a6m (258)  — chegada a partir de 17a6m

drop function if exists public.dashboard_passagens_ramo();
drop function if exists public.dashboard_detalhe_passagem(integer);

create or replace function public._idade_anos(p_nasc date)
returns integer
language sql
stable
as $$
  select case
    when p_nasc is null then null
    else extract(year from age(current_date, p_nasc))::integer
  end;
$$;

create or replace function public._idade_meses_apos_aniversario(p_nasc date)
returns integer
language sql
stable
as $$
  select case
    when p_nasc is null then null
    else extract(month from age(current_date, p_nasc))::integer
  end;
$$;

create or replace function public._idade_meses_totais(p_nasc date)
returns integer
language sql
stable
as $$
  select case
    when p_nasc is null then null
    else (
      extract(year from age(current_date, p_nasc))::integer * 12
      + extract(month from age(current_date, p_nasc))::integer
    )
  end;
$$;

create or replace function public.dashboard_passagens_ramo()
returns table (
  ramo_id integer,
  ramo_nome text,
  ano_ini integer,
  ano_fim integer,
  total_passagem bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with limites as (
    -- meses_ini = limite do ramo anterior (chegada); meses_fim = limite deste ramo (saída)
    select * from (values
      (1, 0,   126),  -- Lobinho: saída >= 10a6m
      (2, 126, 174),  -- Escoteiro: chegada >= 10a6m / saída >= 14a6m
      (3, 174, 210),  -- Sênior: chegada >= 14a6m / saída >= 17a6m
      (4, 210, 258)   -- Pioneiro: chegada >= 17a6m / saída >= 21a6m
    ) as t(ramo_id, meses_ini, meses_fim)
  ),
  base as (
    select
      a.associado_id,
      a.ramo,
      public._idade_meses_totais(a.data_nascimento) as meses_totais
    from public.associados a
    where a.empresa_id = public.current_empresa_id()
      and coalesce(a.ativo, true) = true
      and exists (
        select 1 from public.categoria c
        where c.categoria_id = a.categoria
          and upper(c.nome) like '%BENEFICI%'
      )
      and a.data_nascimento is not null
  )
  select
    l.ramo_id,
    case
      when r.ramo_id = 3 then U&'S\00CANIOR'::text
      else r.nome::text
    end as ramo_nome,
    l.meses_ini as ano_ini,
    l.meses_fim as ano_fim,
    (
      select count(*)::bigint
      from base b
      where
        (b.ramo = l.ramo_id - 1 and b.meses_totais >= l.meses_ini)
        or (b.ramo = l.ramo_id and b.meses_totais >= l.meses_fim)
    ) as total_passagem
  from limites l
  join public.ramos r on r.ramo_id = l.ramo_id
  order by l.ramo_id;
$$;

create or replace function public.dashboard_detalhe_passagem(p_ramo integer)
returns table (
  tipo text,
  associado_id integer,
  nome text,
  data_nascimento date,
  anos integer,
  meses integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with limites as (
    select * from (values
      (1, 0,   126),
      (2, 126, 174),
      (3, 174, 210),
      (4, 210, 258)
    ) as t(ramo_id, meses_ini, meses_fim)
  ),
  lim as (
    select meses_ini, meses_fim
    from limites
    where ramo_id = p_ramo
  ),
  base as (
    select
      a.associado_id,
      a.nome,
      a.data_nascimento,
      a.ramo,
      public._idade_anos(a.data_nascimento) as anos,
      public._idade_meses_apos_aniversario(a.data_nascimento) as meses,
      public._idade_meses_totais(a.data_nascimento) as meses_totais
    from public.associados a
    where a.empresa_id = public.current_empresa_id()
      and coalesce(a.ativo, true) = true
      and exists (
        select 1 from public.categoria c
        where c.categoria_id = a.categoria
          and upper(c.nome) like '%BENEFICI%'
      )
      and a.data_nascimento is not null
  )
  select
    'chegada'::text as tipo,
    b.associado_id,
    b.nome::text,
    b.data_nascimento,
    b.anos,
    b.meses
  from base b, lim
  where b.ramo = p_ramo - 1
    and b.meses_totais >= lim.meses_ini

  union all

  select
    'saida'::text as tipo,
    b.associado_id,
    b.nome::text,
    b.data_nascimento,
    b.anos,
    b.meses
  from base b, lim
  where b.ramo = p_ramo
    and b.meses_totais >= lim.meses_fim

  order by 1, 5, 6, 3;
$$;

grant execute on function public._idade_anos(date) to authenticated;
grant execute on function public._idade_meses_apos_aniversario(date) to authenticated;
grant execute on function public._idade_meses_totais(date) to authenticated;
grant execute on function public.dashboard_passagens_ramo() to authenticated;
grant execute on function public.dashboard_detalhe_passagem(integer) to authenticated;
