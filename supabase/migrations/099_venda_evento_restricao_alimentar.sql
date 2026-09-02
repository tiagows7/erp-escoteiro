-- Restrição alimentar por convite de evento

alter table public.venda_evento_convite
  add column if not exists restricao_alimentar text;

comment on column public.venda_evento_convite.restricao_alimentar is
  'Restrição alimentar informada na compra (ex.: vegano, vegetariano). Null/vazio = sem restrição.';

alter table public.pix_cobrancas
  add column if not exists restricoes_alimentares text[] not null default '{}';

alter table public.infinitepay_pedidos
  add column if not exists restricoes_alimentares text[] not null default '{}';

comment on column public.pix_cobrancas.restricoes_alimentares is
  'Restrições alimentares paralelas a nomes (venda_evento).';

comment on column public.infinitepay_pedidos.restricoes_alimentares is
  'Restrições alimentares paralelas a nomes (venda_evento).';

-- Compra com restrições (p_restricoes paralelo a p_nomes)
drop function if exists public.venda_evento_comprar(integer, text[], text, text, integer[]);

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
  if v_forma is not null and v_forma not in ('dinheiro', 'pix_direto') then
    return query select false, 'Forma de pagamento inválida.'::text, null::integer, '{}'::integer[];
    return;
  end if;

  for v_n in v_evento.numero_inicial .. v_evento.numero_final loop
    if not exists (
      select 1
      from public.venda_evento_convite c
      where c.evento_id = v_evento.evento_id
        and c.numero = v_n
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
      restricao_alimentar
    ) values (
      v_evento.empresa_id,
      v_evento.evento_id,
      v_compra_id,
      v_free[v_n],
      v_nomes[v_n],
      v_tipo.tipo_id,
      v_unit,
      v_tipo.label,
      v_restricao
    );
  end loop;

  return query
    select
      true,
      (
        case
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
