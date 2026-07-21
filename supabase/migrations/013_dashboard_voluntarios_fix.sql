-- Ver 014_dashboard_ramos_beneficiarios.sql (contagem + detalhe atuais).

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

grant execute on function public._categoria_eh_beneficiario(integer) to authenticated;
grant execute on function public.dashboard_contagem_ramos() to authenticated;
