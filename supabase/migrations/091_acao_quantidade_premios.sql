-- Quantidade de prêmios no sorteio da ação entre amigos (N números distintos).

alter table public.acao_entre_amigos
  add column if not exists quantidade_premios integer not null default 1;

alter table public.acao_entre_amigos
  add column if not exists numeros_sorteados integer[];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'acao_entre_amigos_quantidade_premios_chk'
  ) then
    alter table public.acao_entre_amigos
      add constraint acao_entre_amigos_quantidade_premios_chk
      check (quantidade_premios >= 1 and quantidade_premios <= 100);
  end if;
end $$;

comment on column public.acao_entre_amigos.quantidade_premios is
  'Quantidade de prêmios (números distintos) a sortear.';
comment on column public.acao_entre_amigos.numeros_sorteados is
  'Números sorteados em ordem de prêmio (1º, 2º, …).';

update public.acao_entre_amigos
set numeros_sorteados = array[numero_sorteado]
where numero_sorteado is not null
  and (numeros_sorteados is null or cardinality(numeros_sorteados) = 0);

drop function if exists public.acao_amigos_sortear(integer, boolean);

create or replace function public.acao_amigos_sortear(
  p_acao_id integer,
  p_refazer boolean default false
)
returns table (
  ok boolean,
  mensagem text,
  premio integer,
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
  v_qtd integer;
  v_bloqueada boolean;
  v_picked integer[];
  v_num integer;
  v_idx integer;
  v_nome text;
  v_fone text;
begin
  if auth.uid() is null then
    return query select false, 'Não autenticado.'::text, null::integer, null::integer, null::text, null::text;
    return;
  end if;

  if not public.can_write_empresa(v_empresa) then
    return query select false, 'Sem permissão para sortear.'::text, null::integer, null::integer, null::text, null::text;
    return;
  end if;

  select * into v_acao
  from public.acao_entre_amigos a
  where a.acao_id = p_acao_id
    and a.empresa_id = v_empresa
  for update;

  if not found then
    return query select false, 'Ação não encontrada.'::text, null::integer, null::integer, null::text, null::text;
    return;
  end if;

  v_total := v_acao.numero_final - v_acao.numero_inicial + 1;
  select count(*)::integer into v_vendidos
  from public.acao_entre_amigos_venda v
  where v.acao_id = v_acao.acao_id;

  if coalesce(v_vendidos, 0) < 1 then
    return query select false, 'Não há números vendidos para sortear.'::text, null::integer, null::integer, null::text, null::text;
    return;
  end if;

  v_qtd := greatest(1, least(coalesce(v_acao.quantidade_premios, 1), v_vendidos, 100));

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
      null::integer,
      null::text,
      null::text;
    return;
  end if;

  if (
    v_acao.numero_sorteado is not null
    or cardinality(coalesce(v_acao.numeros_sorteados, '{}'::integer[])) > 0
  ) and not coalesce(p_refazer, false) then
    v_picked := coalesce(
      nullif(v_acao.numeros_sorteados, '{}'::integer[]),
      case
        when v_acao.numero_sorteado is not null then array[v_acao.numero_sorteado]
        else '{}'::integer[]
      end
    );

    v_idx := 1;
    foreach v_num in array v_picked loop
      select v.comprador_nome, v.comprador_telefone
      into v_nome, v_fone
      from public.acao_entre_amigos_venda v
      where v.acao_id = v_acao.acao_id
        and v.numero = v_num
      limit 1;

      return query select
        true,
        'Sorteio já realizado.'::text,
        v_idx,
        v_num,
        coalesce(v_nome, '')::text,
        coalesce(v_fone, '')::text;
      v_idx := v_idx + 1;
    end loop;
    return;
  end if;

  select coalesce(array_agg(x.numero), '{}'::integer[])
  into v_picked
  from (
    select v.numero
    from public.acao_entre_amigos_venda v
    where v.acao_id = v_acao.acao_id
    order by random()
    limit v_qtd
  ) x;

  if cardinality(v_picked) < 1 then
    return query select false, 'Falha ao escolher os números.'::text, null::integer, null::integer, null::text, null::text;
    return;
  end if;

  update public.acao_entre_amigos
  set
    numeros_sorteados = v_picked,
    numero_sorteado = v_picked[1],
    sorteado_em = now(),
    encerrado_em = coalesce(encerrado_em, now())
  where acao_id = v_acao.acao_id
    and empresa_id = v_empresa;

  v_idx := 1;
  foreach v_num in array v_picked loop
    select v.comprador_nome, v.comprador_telefone
    into v_nome, v_fone
    from public.acao_entre_amigos_venda v
    where v.acao_id = v_acao.acao_id
      and v.numero = v_num
    limit 1;

    return query select
      true,
      (
        case
          when cardinality(v_picked) = 1 then 'Número sorteado: ' || v_num::text
          else 'Prêmio ' || v_idx::text || 'º: número ' || v_num::text
        end
      )::text,
      v_idx,
      v_num,
      coalesce(v_nome, '')::text,
      coalesce(v_fone, '')::text;
    v_idx := v_idx + 1;
  end loop;
end;
$$;

revoke all on function public.acao_amigos_sortear(integer, boolean) from public;
grant execute on function public.acao_amigos_sortear(integer, boolean) to authenticated;

-- Mesma lógica de 074, bloqueando venda também quando numeros_sorteados estiver preenchido.
create or replace function public.acao_amigos_vender(
  p_acao_id integer,
  p_numeros integer[],
  p_comprador_nome text,
  p_comprador_telefone text,
  p_forma_pagamento text
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
  v_acao public.acao_entre_amigos%rowtype;
  v_faixa public.acao_entre_amigos_faixa%rowtype;
  v_nome text;
  v_fone text;
  v_forma text;
  v_nums integer[];
  v_n integer;
  v_conflict integer[];
  v_saved integer[] := '{}';
  v_assoc_id integer;
  v_registro_digits text;
  v_is_staff boolean;
  v_hoje date := (timezone('America/Sao_Paulo', now()))::date;
begin
  if auth.uid() is null then
    return query select false, 'Não autenticado.'::text, '{}'::integer[];
    return;
  end if;

  v_nome := nullif(btrim(coalesce(p_comprador_nome, '')), '');
  v_fone := nullif(btrim(coalesce(p_comprador_telefone, '')), '');
  v_forma := nullif(btrim(coalesce(p_forma_pagamento, '')), '');

  if v_nome is null then
    return query select false, 'Informe o nome do comprador.'::text, '{}'::integer[];
    return;
  end if;
  if v_fone is null then
    return query select false, 'Informe o telefone do comprador.'::text, '{}'::integer[];
    return;
  end if;
  if v_forma is null or v_forma not in ('dinheiro', 'pix_direto') then
    return query
      select
        false,
        'Forma de pagamento inválida. Use Dinheiro ou PIX direto.'::text,
        '{}'::integer[];
    return;
  end if;
  if p_numeros is null or cardinality(p_numeros) = 0 then
    return query select false, 'Selecione ao menos um número.'::text, '{}'::integer[];
    return;
  end if;

  select * into v_acao
  from public.acao_entre_amigos a
  where a.acao_id = p_acao_id
  for update;

  if not found then
    return query select false, 'Ação não encontrada.'::text, '{}'::integer[];
    return;
  end if;

  if not public.can_access_empresa(v_acao.empresa_id) then
    return query select false, 'Sem acesso a este grupo.'::text, '{}'::integer[];
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

  if v_acao.numero_sorteado is not null
     or cardinality(coalesce(v_acao.numeros_sorteados, '{}'::integer[])) > 0 then
    return query select false, 'O sorteio já foi realizado.'::text, '{}'::integer[];
    return;
  end if;

  v_is_staff := public.can_write_empresa(v_acao.empresa_id);

  select nullif(regexp_replace(coalesce(p.registro, ''), '\D', '', 'g'), '')
  into v_registro_digits
  from public.profiles p
  where p.id = auth.uid();

  v_assoc_id := null;
  if v_registro_digits is not null then
    select a.associado_id
    into v_assoc_id
    from public.associados a
    where a.empresa_id = v_acao.empresa_id
      and a.registro = v_registro_digits::integer
    limit 1;
  end if;

  if v_assoc_id is not null then
    select * into v_faixa
    from public.acao_entre_amigos_faixa f
    where f.acao_id = v_acao.acao_id
      and f.empresa_id = v_acao.empresa_id
      and f.associado_id = v_assoc_id
    for update;
  end if;

  if not v_is_staff then
    if v_faixa.faixa_id is null then
      return query
        select
          false,
          'Você não tem faixa nesta ação para vender números.'::text,
          '{}'::integer[];
      return;
    end if;
  end if;

  select array_agg(distinct n order by n)
  into v_nums
  from unnest(p_numeros) as n;

  if exists (
    select 1
    from unnest(v_nums) as n
    where n < v_acao.numero_inicial or n > v_acao.numero_final
  ) then
    return query select false, 'Há números fora da faixa desta ação.'::text, '{}'::integer[];
    return;
  end if;

  if not v_is_staff and exists (
    select 1
    from unnest(v_nums) as n
    where n < v_faixa.numero_inicial or n > v_faixa.numero_final
  ) then
    return query
      select false, 'Há números fora da sua faixa de venda.'::text, '{}'::integer[];
    return;
  end if;

  select array_agg(v.numero order by v.numero)
  into v_conflict
  from public.acao_entre_amigos_venda v
  where v.acao_id = v_acao.acao_id
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
      forma_pagamento,
      associado_vendedor_id,
      vendido_por
    ) values (
      v_acao.empresa_id,
      v_acao.acao_id,
      v_n,
      left(v_nome, 200),
      left(v_fone, 40),
      coalesce(v_acao.valor_numero, 0),
      v_forma,
      case
        when not v_is_staff then v_faixa.associado_id
        when v_faixa.faixa_id is not null
          and v_n >= v_faixa.numero_inicial
          and v_n <= v_faixa.numero_final
        then v_faixa.associado_id
        else null
      end,
      auth.uid()
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

revoke all on function public.acao_amigos_vender(
  integer, integer[], text, text, text
) from public;
grant execute on function public.acao_amigos_vender(
  integer, integer[], text, text, text
) to authenticated;
