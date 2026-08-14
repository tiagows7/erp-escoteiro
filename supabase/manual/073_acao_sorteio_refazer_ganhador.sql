-- Sorteio: retorna ganhador completo e permite refazer

drop function if exists public.acao_amigos_sortear(integer);

create or replace function public.acao_amigos_sortear(
  p_acao_id integer,
  p_refazer boolean default false
)
returns table (
  ok boolean,
  mensagem text,
  numero_sorteado integer,
  comprador_nome text,
  comprador_telefone text
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
  v_nome text;
  v_fone text;
  v_bloqueada boolean;
begin
  if auth.uid() is null then
    return query select false, 'Não autenticado.'::text, null::integer, null::text, null::text;
    return;
  end if;

  if not public.can_write_empresa(v_empresa) then
    return query select false, 'Sem permissão para sortear.'::text, null::integer, null::text, null::text;
    return;
  end if;

  select * into v_acao
  from public.acao_entre_amigos a
  where a.acao_id = p_acao_id
    and a.empresa_id = v_empresa
  for update;

  if not found then
    return query select false, 'Ação não encontrada.'::text, null::integer, null::text, null::text;
    return;
  end if;

  v_total := v_acao.numero_final - v_acao.numero_inicial + 1;
  select count(*)::integer into v_vendidos
  from public.acao_entre_amigos_venda v
  where v.acao_id = v_acao.acao_id;

  if coalesce(v_vendidos, 0) < 1 then
    return query select false, 'Não há números vendidos para sortear.'::text, null::integer, null::text, null::text;
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
      null::integer,
      null::text,
      null::text;
    return;
  end if;

  -- Sem refazer: devolve o sorteio já existente com dados do comprador
  if v_acao.numero_sorteado is not null and not coalesce(p_refazer, false) then
    select v.comprador_nome, v.comprador_telefone
    into v_nome, v_fone
    from public.acao_entre_amigos_venda v
    where v.acao_id = v_acao.acao_id
      and v.numero = v_acao.numero_sorteado
    limit 1;

    return query select
      true,
      'Sorteio já realizado.'::text,
      v_acao.numero_sorteado,
      coalesce(v_nome, '')::text,
      coalesce(v_fone, '')::text;
    return;
  end if;

  select v.numero, v.comprador_nome, v.comprador_telefone
  into v_pick, v_nome, v_fone
  from public.acao_entre_amigos_venda v
  where v.acao_id = v_acao.acao_id
  order by random()
  limit 1;

  if v_pick is null then
    return query select false, 'Falha ao escolher o número.'::text, null::integer, null::text, null::text;
    return;
  end if;

  update public.acao_entre_amigos
  set
    numero_sorteado = v_pick,
    sorteado_em = now(),
    encerrado_em = coalesce(encerrado_em, now())
  where acao_id = v_acao.acao_id
    and empresa_id = v_empresa;

  return query select
    true,
    ('Número sorteado: ' || v_pick::text)::text,
    v_pick,
    coalesce(v_nome, '')::text,
    coalesce(v_fone, '')::text;
end;
$$;

revoke all on function public.acao_amigos_sortear(integer, boolean) from public;
grant execute on function public.acao_amigos_sortear(integer, boolean) to authenticated;
