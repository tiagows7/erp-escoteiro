-- Cards de ramo (1-4): so beneficiarios do ramo.
-- Card 5 (Voluntarios): mantem regra atual.
-- Popup: dashboard_detalhe_ramo lista os associados do card.

create or replace function public._categoria_eh_beneficiario(p_categoria_id integer)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.categoria c
    where c.categoria_id = p_categoria_id
      and upper(c.nome) like '%BENEFICI%'
  );
$$;

create or replace function public.dashboard_contagem_ramos()
returns table (ramo_id integer, ramo_nome text, total bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    r.ramo_id,
    case
      when r.ramo_id = 5 then U&'VOLUNT\00C1RIOS'::text
      else r.nome::text
    end as ramo_nome,
    case
      when r.ramo_id = 5 then (
        select count(*)::bigint
        from public.associados a
        where a.empresa_id = public.current_empresa_id()
          and coalesce(a.ativo, true) = true
          and (
            public._idade_anos(a.data_nascimento) > 22
            or (
              a.categoria is not null
              and not public._categoria_eh_beneficiario(a.categoria)
            )
          )
      )
      else (
        select count(*)::bigint
        from public.associados a
        where a.empresa_id = public.current_empresa_id()
          and coalesce(a.ativo, true) = true
          and a.ramo = r.ramo_id
          and public._categoria_eh_beneficiario(a.categoria)
      )
    end as total
  from public.ramos r
  order by r.ramo_id;
$$;

create or replace function public.dashboard_detalhe_ramo(p_ramo integer)
returns table (
  associado_id integer,
  nome text,
  registro integer,
  data_nascimento date,
  anos integer,
  meses integer,
  secao_nome text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    a.associado_id,
    a.nome::text,
    a.registro,
    a.data_nascimento,
    public._idade_anos(a.data_nascimento)::integer as anos,
    public._idade_meses_apos_aniversario(a.data_nascimento)::integer as meses,
    s.nome::text as secao_nome
  from public.associados a
  left join public.secao s on s.secao_id = a.secao
  where a.empresa_id = public.current_empresa_id()
    and coalesce(a.ativo, true) = true
    and (
      (
        p_ramo = 5
        and (
          public._idade_anos(a.data_nascimento) > 22
          or (
            a.categoria is not null
            and not public._categoria_eh_beneficiario(a.categoria)
          )
        )
      )
      or (
        p_ramo <> 5
        and a.ramo = p_ramo
        and public._categoria_eh_beneficiario(a.categoria)
      )
    )
  order by a.nome;
$$;

grant execute on function public._categoria_eh_beneficiario(integer) to authenticated;
grant execute on function public.dashboard_contagem_ramos() to authenticated;
grant execute on function public.dashboard_detalhe_ramo(integer) to authenticated;
