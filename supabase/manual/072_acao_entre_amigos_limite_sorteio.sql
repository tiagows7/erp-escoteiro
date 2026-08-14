-- Ação entre amigos: data limite de vendas + resultado do sorteio

alter table public.acao_entre_amigos
  add column if not exists data_limite_venda date,
  add column if not exists numero_sorteado integer,
  add column if not exists sorteado_em timestamptz;

comment on column public.acao_entre_amigos.data_limite_venda is
  'Último dia em que vendas são aceitas (inclusive). Depois disso, vendas ficam bloqueadas.';
comment on column public.acao_entre_amigos.numero_sorteado is
  'Número vencedor do sorteio (somente entre vendidos).';
comment on column public.acao_entre_amigos.sorteado_em is
  'Quando o sorteio foi registrado.';

-- Info pública: bloqueio por encerrado OU data limite + resultado
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
  data_sorteio date,
  data_limite_venda date,
  encerrado boolean,
  numero_sorteado integer,
  sorteado_em timestamptz
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
    a.data_sorteio,
    a.data_limite_venda,
    (
      a.encerrado_em is not null
      or (
        a.data_limite_venda is not null
        and a.data_limite_venda < (timezone('America/Sao_Paulo', now()))::date
      )
    ),
    a.numero_sorteado,
    a.sorteado_em
  from public.acao_entre_amigos a
  join public.empresa e on e.id = a.empresa_id
  left join public.associados assoc on assoc.associado_id = v_faixa.associado_id
  where a.acao_id = v_faixa.acao_id
    and a.empresa_id = v_faixa.empresa_id;
end;
$$;

revoke all on function public.acao_amigos_public_info(uuid) from public;
grant execute on function public.acao_amigos_public_info(uuid) to anon, authenticated;

-- Venda pública: também bloqueia após data limite
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
  v_hoje date := (timezone('America/Sao_Paulo', now()))::date;
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

  if v_acao.encerrado_em is not null then
    return query select false, 'Esta ação entre amigos está encerrada.'::text, '{}'::integer[];
    return;
  end if;

  if v_acao.data_limite_venda is not null and v_acao.data_limite_venda < v_hoje then
    return query select false, 'O prazo de vendas desta ação já encerrou.'::text, '{}'::integer[];
    return;
  end if;

  if v_acao.numero_sorteado is not null then
    return query select false, 'O sorteio já foi realizado.'::text, '{}'::integer[];
    return;
  end if;

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

-- Sorteio autenticado: só números vendidos; exige vendas bloqueadas
create or replace function public.acao_amigos_sortear(p_acao_id integer)
returns table (
  ok boolean,
  mensagem text,
  numero_sorteado integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acao public.acao_entre_amigos%rowtype;
  v_empresa integer := public.current_empresa_id();
  v_hoje date := (timezone('America/Sao_Paulo', now()))::date;
  v_total integer;
  v_vendidos integer;
  v_pick integer;
  v_bloqueada boolean;
begin
  if auth.uid() is null then
    return query select false, 'Não autenticado.'::text, null::integer;
    return;
  end if;

  if not public.can_write_empresa(v_empresa) then
    return query select false, 'Sem permissão para sortear.'::text, null::integer;
    return;
  end if;

  select * into v_acao
  from public.acao_entre_amigos a
  where a.acao_id = p_acao_id
    and a.empresa_id = v_empresa
  for update;

  if not found then
    return query select false, 'Ação não encontrada.'::text, null::integer;
    return;
  end if;

  if v_acao.numero_sorteado is not null then
    return query select true, 'Sorteio já realizado.'::text, v_acao.numero_sorteado;
    return;
  end if;

  v_total := v_acao.numero_final - v_acao.numero_inicial + 1;
  select count(*)::integer into v_vendidos
  from public.acao_entre_amigos_venda v
  where v.acao_id = v_acao.acao_id;

  if coalesce(v_vendidos, 0) < 1 then
    return query select false, 'Não há números vendidos para sortear.'::text, null::integer;
    return;
  end if;

  v_bloqueada :=
    v_acao.encerrado_em is not null
    or (
      v_acao.data_limite_venda is not null
      and v_acao.data_limite_venda < v_hoje
    )
    or (v_total > 0 and v_vendidos >= v_total);

  if not v_bloqueada then
    return query select
      false,
      'Encerre as vendas, aguarde a data limite ou venda todos os números antes do sorteio.'::text,
      null::integer;
    return;
  end if;

  select v.numero into v_pick
  from public.acao_entre_amigos_venda v
  where v.acao_id = v_acao.acao_id
  order by random()
  limit 1;

  if v_pick is null then
    return query select false, 'Falha ao escolher o número.'::text, null::integer;
    return;
  end if;

  update public.acao_entre_amigos
  set
    numero_sorteado = v_pick,
    sorteado_em = now(),
    encerrado_em = coalesce(encerrado_em, now())
  where acao_id = v_acao.acao_id
    and empresa_id = v_empresa;

  return query select true, ('Número sorteado: ' || v_pick::text)::text, v_pick;
end;
$$;

revoke all on function public.acao_amigos_sortear(integer) from public;
grant execute on function public.acao_amigos_sortear(integer) to authenticated;
