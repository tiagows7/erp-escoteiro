-- Lista do card de ramo no dashboard: ordenar por seção, depois nome.

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
  order by
    s.nome nulls last,
    a.nome;
$$;

revoke all on function public.dashboard_detalhe_ramo(integer) from public;
grant execute on function public.dashboard_detalhe_ramo(integer) to authenticated;
