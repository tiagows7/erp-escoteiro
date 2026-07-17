-- Card "Diretoria" (ramo_id = 5) passa a ser "VOLUNTÁRIOS":
-- associados ativos que NÃO são beneficiários (categoria <> 2)
-- OU têm idade maior que 22 anos.

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
      when r.ramo_id = 5 then 'VOLUNTÁRIOS'::text
      else r.nome::text
    end as ramo_nome,
    case
      when r.ramo_id = 5 then (
        select count(*)::bigint
        from public.associados a
        where a.empresa_id = public.current_empresa_id()
          and coalesce(a.ativo, true) = true
          and (
            coalesce(a.categoria, -1) <> 2
            or public._idade_anos(a.data_nascimento) > 22
          )
      )
      else (
        select count(*)::bigint
        from public.associados a
        where a.empresa_id = public.current_empresa_id()
          and coalesce(a.ativo, true) = true
          and a.ramo = r.ramo_id
      )
    end as total
  from public.ramos r
  order by r.ramo_id;
$$;

grant execute on function public.dashboard_contagem_ramos() to authenticated;
