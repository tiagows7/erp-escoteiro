-- Data do sorteio da ação entre amigos

alter table public.acao_entre_amigos
  add column if not exists data_sorteio date;

comment on column public.acao_entre_amigos.data_sorteio is
  'Data prevista do sorteio da ação entre amigos';

drop function if exists public.acao_amigos_public_info(uuid);

create or replace function public.acao_amigos_public_info(p_token uuid)
returns table (
  acao_id integer,
  acao_nome text,
  valor_numero numeric,
  numero_inicial integer,
  numero_final integer,
  vendedor_nome text,
  empresa_nome text,
  numeros_vendidos integer[],
  imagem_url text,
  data_sorteio date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_faixa public.acao_entre_amigos_faixa%rowtype;
begin
  select * into v_faixa
  from public.acao_entre_amigos_faixa f
  where f.link_token = p_token;

  if not found then
    return;
  end if;

  return query
  select
    a.acao_id,
    a.nome::text,
    a.valor_numero,
    v_faixa.numero_inicial,
    v_faixa.numero_final,
    coalesce(assoc.nome, 'Vendedor')::text,
    coalesce(e.nome, '')::text,
    coalesce(
      (
        select array_agg(v.numero order by v.numero)
        from public.acao_entre_amigos_venda v
        where v.acao_id = a.acao_id
          and v.numero between v_faixa.numero_inicial and v_faixa.numero_final
      ),
      '{}'::integer[]
    ),
    a.imagem_url,
    a.data_sorteio
  from public.acao_entre_amigos a
  join public.empresa e on e.id = a.empresa_id
  left join public.associados assoc on assoc.associado_id = v_faixa.associado_id
  where a.acao_id = v_faixa.acao_id
    and a.empresa_id = v_faixa.empresa_id;
end;
$$;

revoke all on function public.acao_amigos_public_info(uuid) from public;
grant execute on function public.acao_amigos_public_info(uuid) to anon, authenticated;
