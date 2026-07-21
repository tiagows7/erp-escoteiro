-- Dashboard: so ramos oficiais 1-5.
-- Remove ramos extras criados por engano no import Excel.

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
      when r.ramo_id = 3 then U&'S\00CANIOR'::text
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
  where r.ramo_id between 1 and 5
  order by r.ramo_id;
$$;

grant execute on function public.dashboard_contagem_ramos() to authenticated;

update public.associados
set ramo = null
where ramo is not null
  and ramo not in (1, 2, 3, 4, 5);

delete from public.ramos
where ramo_id not in (1, 2, 3, 4, 5);
