-- Link público de venda (fora do app) por faixa do jovem

alter table public.acao_entre_amigos_faixa
  add column if not exists link_token uuid not null default gen_random_uuid();

create unique index if not exists acao_entre_amigos_faixa_link_token_uq
  on public.acao_entre_amigos_faixa (link_token);

-- Dados públicos da rifa (sem login)
create or replace function public.acao_amigos_public_info(p_token uuid)
returns table (
  acao_id integer,
  acao_nome text,
  valor_numero numeric,
  numero_inicial integer,
  numero_final integer,
  vendedor_nome text,
  empresa_nome text,
  numeros_vendidos integer[]
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
    )
  from public.acao_entre_amigos a
  join public.empresa e on e.id = a.empresa_id
  left join public.associados assoc on assoc.associado_id = v_faixa.associado_id
  where a.acao_id = v_faixa.acao_id
    and a.empresa_id = v_faixa.empresa_id;
end;
$$;

revoke all on function public.acao_amigos_public_info(uuid) from public;
grant execute on function public.acao_amigos_public_info(uuid) to anon, authenticated;

-- Registrar venda pública (um ou mais números)
create or replace function public.acao_amigos_public_vender(
  p_token uuid,
  p_numeros integer[],
  p_comprador_nome text,
  p_comprador_telefone text
)
returns table (
  ok boolean,
  mensagem text,
  numeros_salvos integer[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_faixa public.acao_entre_amigos_faixa%rowtype;
  v_acao public.acao_entre_amigos%rowtype;
  v_nome text;
  v_fone text;
  v_nums integer[];
  v_n integer;
  v_conflict integer[];
  v_saved integer[] := '{}';
begin
  v_nome := nullif(btrim(coalesce(p_comprador_nome, '')), '');
  v_fone := nullif(btrim(coalesce(p_comprador_telefone, '')), '');

  if v_nome is null then
    return query select false, 'Informe o nome do comprador.'::text, '{}'::integer[];
    return;
  end if;
  if v_fone is null then
    return query select false, 'Informe o telefone do comprador.'::text, '{}'::integer[];
    return;
  end if;
  if p_numeros is null or cardinality(p_numeros) = 0 then
    return query select false, 'Selecione ao menos um número.'::text, '{}'::integer[];
    return;
  end if;

  select * into v_faixa
  from public.acao_entre_amigos_faixa f
  where f.link_token = p_token
  for update;

  if not found then
    return query select false, 'Link inválido ou expirado.'::text, '{}'::integer[];
    return;
  end if;

  select * into v_acao
  from public.acao_entre_amigos a
  where a.acao_id = v_faixa.acao_id
    and a.empresa_id = v_faixa.empresa_id;

  if not found then
    return query select false, 'Ação não encontrada.'::text, '{}'::integer[];
    return;
  end if;

  -- Normaliza e valida faixa
  select array_agg(distinct n order by n)
  into v_nums
  from unnest(p_numeros) as n;

  if exists (
    select 1
    from unnest(v_nums) as n
    where n < v_faixa.numero_inicial or n > v_faixa.numero_final
  ) then
    return query select false, 'Há números fora da faixa deste vendedor.'::text, '{}'::integer[];
    return;
  end if;

  select array_agg(v.numero order by v.numero)
  into v_conflict
  from public.acao_entre_amigos_venda v
  where v.acao_id = v_faixa.acao_id
    and v.numero = any (v_nums);

  if v_conflict is not null and cardinality(v_conflict) > 0 then
    return query
      select
        false,
        ('Número(s) já vendido(s): ' || array_to_string(v_conflict, ', '))::text,
        '{}'::integer[];
    return;
  end if;

  foreach v_n in array v_nums loop
    insert into public.acao_entre_amigos_venda (
      empresa_id,
      acao_id,
      numero,
      comprador_nome,
      comprador_telefone,
      valor,
      associado_vendedor_id,
      vendido_por
    ) values (
      v_faixa.empresa_id,
      v_faixa.acao_id,
      v_n,
      left(v_nome, 200),
      left(v_fone, 40),
      coalesce(v_acao.valor_numero, 0),
      v_faixa.associado_id,
      null
    );
    v_saved := array_append(v_saved, v_n);
  end loop;

  return query
    select
      true,
      case
        when cardinality(v_saved) = 1 then 'Número vendido com sucesso!'
        else (cardinality(v_saved)::text || ' números vendidos com sucesso!')
      end::text,
      v_saved;
end;
$$;

revoke all on function public.acao_amigos_public_vender(uuid, integer[], text, text) from public;
grant execute on function public.acao_amigos_public_vender(uuid, integer[], text, text)
  to anon, authenticated;
