-- Forma de pagamento "em_aberto": confirma convite e deixa receita a receber

alter table public.venda_evento_compra
  drop constraint if exists venda_evento_compra_forma_pagamento_check;

alter table public.venda_evento_compra
  add constraint venda_evento_compra_forma_pagamento_check
  check (
    forma_pagamento is null
    or forma_pagamento in (
      'dinheiro',
      'pix_direto',
      'pix',
      'infinitepay',
      'em_aberto'
    )
  );

comment on column public.venda_evento_compra.forma_pagamento is
  'dinheiro | pix_direto | pix | infinitepay | em_aberto (receita a receber)';

-- Compra aceita em_aberto
create or replace function public.venda_evento_comprar(
  p_evento_id integer,
  p_nomes text[],
  p_comprador_telefone text default null,
  p_forma_pagamento text default null,
  p_tipo_ids integer[] default null,
  p_restricoes text[] default null
)
returns table (
  ok boolean,
  mensagem text,
  compra_id integer,
  numeros integer[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento public.venda_eventos%rowtype;
  v_qtde integer;
  v_nomes text[];
  v_n integer;
  v_free integer[] := '{}';
  v_compra_id integer;
  v_valor numeric(15, 2) := 0;
  v_fone text;
  v_forma text;
  v_tipo_id integer;
  v_tipo public.venda_evento_tipo%rowtype;
  v_default_tipo_id integer;
  v_unit numeric(15, 2);
  v_restricao text;
begin
  if auth.uid() is null then
    return query select false, 'Não autenticado.'::text, null::integer, '{}'::integer[];
    return;
  end if;

  select * into v_evento
  from public.venda_eventos e
  where e.evento_id = p_evento_id
    and public.can_access_empresa(e.empresa_id)
  for update;

  if not found then
    return query select false, 'Evento não encontrado.'::text, null::integer, '{}'::integer[];
    return;
  end if;

  if v_evento.encerrado_em is not null then
    return query select false, 'Este evento está encerrado.'::text, null::integer, '{}'::integer[];
    return;
  end if;

  v_nomes := array(
    select left(btrim(x), 200)
    from unnest(coalesce(p_nomes, '{}'::text[])) as x
    where btrim(coalesce(x, '')) <> ''
  );
  v_qtde := coalesce(cardinality(v_nomes), 0);

  if v_qtde <= 0 then
    return query select false, 'Informe ao menos um nome.'::text, null::integer, '{}'::integer[];
    return;
  end if;

  select t.tipo_id into v_default_tipo_id
  from public.venda_evento_tipo t
  where t.evento_id = v_evento.evento_id
    and t.ativo = true
  order by t.ordem, t.tipo_id
  limit 1;

  if v_default_tipo_id is null then
    insert into public.venda_evento_tipo (empresa_id, evento_id, label, valor, ordem)
    values (v_evento.empresa_id, v_evento.evento_id, 'Inteira', coalesce(v_evento.valor_convite, 0), 0)
    returning tipo_id into v_default_tipo_id;
  end if;

  v_fone := nullif(left(btrim(coalesce(p_comprador_telefone, '')), 40), '');
  v_forma := nullif(btrim(coalesce(p_forma_pagamento, '')), '');
  if v_forma is not null and v_forma not in ('dinheiro', 'pix_direto', 'em_aberto') then
    return query select false, 'Forma de pagamento inválida.'::text, null::integer, '{}'::integer[];
    return;
  end if;

  for v_n in v_evento.numero_inicial .. v_evento.numero_final loop
    if not exists (
      select 1
      from public.venda_evento_convite c
      where c.evento_id = v_evento.evento_id
        and c.numero = v_n
        and c.ativo = true
    ) then
      v_free := array_append(v_free, v_n);
      exit when cardinality(v_free) >= v_qtde;
    end if;
  end loop;

  if cardinality(v_free) < v_qtde then
    return query
      select
        false,
        (
          'Só há ' || coalesce(cardinality(v_free), 0)::text ||
          ' convite(s) disponível(is).'
        )::text,
        null::integer,
        '{}'::integer[];
    return;
  end if;

  for v_n in 1 .. v_qtde loop
    v_tipo_id := null;
    if p_tipo_ids is not null and cardinality(p_tipo_ids) >= v_n then
      v_tipo_id := p_tipo_ids[v_n];
    end if;
    if v_tipo_id is null then
      v_tipo_id := v_default_tipo_id;
    end if;

    select * into v_tipo
    from public.venda_evento_tipo t
    where t.tipo_id = v_tipo_id
      and t.evento_id = v_evento.evento_id
      and t.ativo = true;

    if not found then
      return query select false, 'Tipo de convite inválido.'::text, null::integer, '{}'::integer[];
      return;
    end if;

    v_valor := v_valor + coalesce(v_tipo.valor, 0);
  end loop;
  v_valor := round(v_valor, 2);

  insert into public.venda_evento_compra (
    empresa_id,
    evento_id,
    quantidade,
    comprador_telefone,
    valor,
    forma_pagamento,
    vendido_por
  ) values (
    v_evento.empresa_id,
    v_evento.evento_id,
    v_qtde,
    v_fone,
    v_valor,
    v_forma,
    auth.uid()
  )
  returning venda_evento_compra.compra_id into v_compra_id;

  for v_n in 1 .. v_qtde loop
    v_tipo_id := null;
    if p_tipo_ids is not null and cardinality(p_tipo_ids) >= v_n then
      v_tipo_id := p_tipo_ids[v_n];
    end if;
    if v_tipo_id is null then
      v_tipo_id := v_default_tipo_id;
    end if;

    select * into v_tipo
    from public.venda_evento_tipo t
    where t.tipo_id = v_tipo_id;

    v_unit := coalesce(v_tipo.valor, 0);

    v_restricao := null;
    if p_restricoes is not null and cardinality(p_restricoes) >= v_n then
      v_restricao := nullif(left(btrim(coalesce(p_restricoes[v_n], '')), 120), '');
    end if;

    insert into public.venda_evento_convite (
      empresa_id,
      evento_id,
      compra_id,
      numero,
      nome,
      tipo_id,
      valor_unitario,
      tipo_label,
      restricao_alimentar,
      ativo
    ) values (
      v_evento.empresa_id,
      v_evento.evento_id,
      v_compra_id,
      v_free[v_n],
      v_nomes[v_n],
      v_tipo.tipo_id,
      v_unit,
      v_tipo.label,
      v_restricao,
      true
    );
  end loop;

  return query
    select
      true,
      (
        case
          when v_forma = 'em_aberto' and v_qtde = 1 then
            'Convite ' || v_free[1]::text || ' confirmado. Receita em aberto para cobrança posterior.'
          when v_forma = 'em_aberto' then
            v_qtde::text || ' convites confirmados (' || array_to_string(v_free, ', ') ||
            '). Receita em aberto para cobrança posterior.'
          when v_qtde = 1 then 'Convite ' || v_free[1]::text || ' registrado.'
          else
            v_qtde::text || ' convites registrados: ' ||
            array_to_string(v_free, ', ')
        end
      )::text,
      v_compra_id,
      v_free;
end;
$$;

revoke all on function public.venda_evento_comprar(
  integer, text[], text, text, integer[], text[]
) from public;
grant execute on function public.venda_evento_comprar(
  integer, text[], text, text, integer[], text[]
) to authenticated;

-- Receita: paga (com baixa) ou em aberto (sem pagamento)
create or replace function public.venda_evento_gerar_receita(p_compra_id integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_compra public.venda_evento_compra%rowtype;
  v_evento public.venda_eventos%rowtype;
  v_receita_id integer;
  v_tipopagto_id integer;
  v_descricao text;
  v_obs text;
  v_forma text;
  v_em_aberto boolean;
  v_data date;
begin
  select * into v_compra
  from public.venda_evento_compra c
  where c.compra_id = p_compra_id
  for update;

  if not found then
    return null;
  end if;

  if v_compra.receita_id is not null then
    return v_compra.receita_id;
  end if;

  if coalesce(v_compra.valor, 0) <= 0 then
    return null;
  end if;

  select * into v_evento
  from public.venda_eventos e
  where e.evento_id = v_compra.evento_id;

  if not found then
    return null;
  end if;

  v_forma := coalesce(v_compra.forma_pagamento, 'dinheiro');
  v_em_aberto := (v_forma = 'em_aberto');
  v_data := (coalesce(v_compra.vendido_em, now()) at time zone 'America/Sao_Paulo')::date;

  v_descricao := left(
    'Convites: ' || coalesce(v_evento.nome, 'Evento') ||
    ' · ' || v_compra.quantidade::text || ' convite(s)',
    120
  );

  v_obs := left(
    'Venda de convites · compra #' || v_compra.compra_id::text ||
    ' · ' ||
    case
      when v_forma = 'pix' then 'PIX online'
      when v_forma = 'pix_direto' then 'PIX direto'
      when v_forma = 'infinitepay' then 'InfinitePay'
      when v_forma = 'dinheiro' then 'Dinheiro'
      when v_forma = 'em_aberto' then 'Em aberto (a receber)'
      else v_forma
    end,
    200
  );

  insert into public.receitas (
    empresa_id,
    receita_origem,
    receita_descricao,
    receita_ramo,
    receita_secao,
    evento_id,
    receita_emissao,
    receita_vencimento,
    receita_valor,
    receita_saldo,
    receita_situacao,
    receita_observacao
  ) values (
    v_compra.empresa_id,
    'A',
    v_descricao,
    v_evento.ramo,
    v_evento.secao,
    v_evento.evento_id,
    v_data,
    v_data,
    round(v_compra.valor, 2),
    case when v_em_aberto then round(v_compra.valor, 2) else 0 end,
    case when v_em_aberto then 1 else 3 end,
    v_obs
  )
  returning receita_id into v_receita_id;

  if not v_em_aberto then
    v_tipopagto_id := public.venda_evento_ensure_tipopagto(
      v_compra.empresa_id,
      v_forma
    );

    insert into public.receita_pagamento (
      empresa_id,
      receita_id,
      tipopagto_id,
      data_pagamento,
      valor,
      observacao
    ) values (
      v_compra.empresa_id,
      v_receita_id,
      v_tipopagto_id,
      v_data,
      round(v_compra.valor, 2),
      left('Recebimento venda de convites #' || v_compra.compra_id::text, 200)
    );
  end if;

  update public.venda_evento_compra
  set receita_id = v_receita_id
  where compra_id = v_compra.compra_id;

  return v_receita_id;
end;
$$;

revoke all on function public.venda_evento_gerar_receita(integer) from public;
grant execute on function public.venda_evento_gerar_receita(integer)
  to authenticated, service_role;
