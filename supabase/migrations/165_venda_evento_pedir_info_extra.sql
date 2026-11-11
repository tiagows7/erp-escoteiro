-- Evento pode pedir informação extra por convite na compra.

alter table public.venda_eventos
  add column if not exists pedir_info_extra boolean not null default false;

comment on column public.venda_eventos.pedir_info_extra is
  'Se true, na compra cada convite pode informar um texto livre adicional.';

alter table public.venda_evento_convite
  add column if not exists info_extra text null;

comment on column public.venda_evento_convite.info_extra is
  'Texto livre informado na compra quando pedir_info_extra estiver ativo.';

alter table public.pix_cobrancas
  add column if not exists infos_extra text[] not null default '{}';

alter table public.infinitepay_pedidos
  add column if not exists infos_extra text[] not null default '{}';

comment on column public.pix_cobrancas.infos_extra is
  'Paralelo a nomes: informação extra de cada convite.';

comment on column public.infinitepay_pedidos.infos_extra is
  'Paralelo a nomes: informação extra de cada convite.';

drop function if exists public.venda_evento_public_info(uuid);

create function public.venda_evento_public_info(p_token uuid)
returns table (
  evento_id integer,
  evento_nome text,
  valor_convite numeric,
  numero_inicial integer,
  numero_final integer,
  data_evento date,
  imagem_url text,
  empresa_nome text,
  disponiveis integer,
  total integer,
  encerrado boolean,
  tipos jsonb,
  vendedor_nome text,
  associado_vendedor_id integer,
  pedir_participacao boolean,
  local text,
  endereco text,
  pedir_ramo boolean,
  pedir_info_extra boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento public.venda_eventos%rowtype;
  v_vendidos integer;
  v_total integer;
  v_tipos jsonb;
  v_vendedor_nome text := null;
  v_associado_vendedor_id integer := null;
begin
  select e.* into v_evento
  from public.venda_evento_vendedor v
  join public.venda_eventos e on e.evento_id = v.evento_id
  where v.link_token = p_token;

  if found then
    select a.associado_id, a.nome
    into v_associado_vendedor_id, v_vendedor_nome
    from public.venda_evento_vendedor v
    join public.associados a on a.associado_id = v.associado_id
    where v.link_token = p_token;
  else
    select * into v_evento
    from public.venda_eventos e
    where e.link_token = p_token;

    if not found then
      return;
    end if;
  end if;

  v_total := v_evento.numero_final - v_evento.numero_inicial + 1;
  if v_total < 0 then
    v_total := 0;
  end if;

  select count(*)::integer into v_vendidos
  from public.venda_evento_convite c
  where c.evento_id = v_evento.evento_id
    and c.ativo = true;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tipo_id', t.tipo_id,
        'label', t.label,
        'valor', t.valor,
        'ordem', t.ordem
      )
      order by t.ordem, t.tipo_id
    ),
    '[]'::jsonb
  )
  into v_tipos
  from public.venda_evento_tipo t
  where t.evento_id = v_evento.evento_id
    and t.ativo = true;

  return query
  select
    v_evento.evento_id,
    v_evento.nome::text,
    v_evento.valor_convite,
    v_evento.numero_inicial,
    v_evento.numero_final,
    v_evento.data_evento,
    v_evento.imagem_url,
    coalesce(e.nome, '')::text,
    greatest(v_total - coalesce(v_vendidos, 0), 0),
    v_total,
    (v_evento.encerrado_em is not null),
    v_tipos,
    v_vendedor_nome,
    v_associado_vendedor_id,
    coalesce(v_evento.pedir_participacao, false),
    nullif(btrim(coalesce(v_evento.local, '')), '')::text,
    nullif(btrim(coalesce(v_evento.endereco, '')), '')::text,
    coalesce(v_evento.pedir_ramo, false),
    coalesce(v_evento.pedir_info_extra, false)
  from public.empresa e
  where e.id = v_evento.empresa_id;
end;
$$;

revoke all on function public.venda_evento_public_info(uuid) from public;
grant execute on function public.venda_evento_public_info(uuid)
  to anon, authenticated;

drop function if exists public.venda_evento_comprar(integer, text[], text, text, integer[], text[]);
drop function if exists public.venda_evento_comprar(integer, text[], text, text, integer[], text[], boolean[]);
drop function if exists public.venda_evento_comprar(integer, text[], text, text, integer[], text[], boolean[], integer[], boolean[]);
drop function if exists public.venda_evento_comprar(integer, text[], text, text, integer[], text[], boolean[], integer[], boolean[], text[]);

create function public.venda_evento_comprar(
  p_evento_id integer,
  p_nomes text[],
  p_comprador_telefone text default null,
  p_forma_pagamento text default null,
  p_tipo_ids integer[] default null,
  p_restricoes text[] default null,
  p_participa boolean[] default null,
  p_convidado_ramos integer[] default null,
  p_eh_staff boolean[] default null,
  p_infos_extra text[] default null
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
  v_participa boolean;
  v_convidado_ramo integer;
  v_eh_staff boolean;
  v_info_extra text;
  v_associado_vendedor_id integer := null;
  v_reg integer;
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

  select nullif(
    regexp_replace(coalesce(p.registro, ''), '[^0-9]', '', 'g'),
    ''
  )::integer
  into v_reg
  from public.profiles p
  where p.id = auth.uid()
    and p.role = 'leitura';

  if v_reg is not null and v_reg > 0 then
    select a.associado_id into v_associado_vendedor_id
    from public.associados a
    where a.empresa_id = v_evento.empresa_id
      and a.registro = v_reg
    limit 1;
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

  if coalesce(v_evento.pedir_ramo, false) then
    for v_n in 1 .. v_qtde loop
      v_eh_staff := false;
      v_convidado_ramo := null;
      if p_eh_staff is not null and cardinality(p_eh_staff) >= v_n then
        v_eh_staff := coalesce(p_eh_staff[v_n], false);
      end if;
      if not v_eh_staff
         and p_convidado_ramos is not null
         and cardinality(p_convidado_ramos) >= v_n then
        v_convidado_ramo := p_convidado_ramos[v_n];
      end if;
      if v_eh_staff then
        continue;
      end if;
      if v_convidado_ramo is null or v_convidado_ramo not in (1, 2, 3, 4) then
        return query select
          false,
          ('Informe o ramo ou participante/família do convite ' || v_n::text || '.')::text,
          null::integer,
          '{}'::integer[];
        return;
      end if;
    end loop;
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
    vendido_por,
    associado_vendedor_id
  ) values (
    v_evento.empresa_id,
    v_evento.evento_id,
    v_qtde,
    v_fone,
    v_valor,
    v_forma,
    auth.uid(),
    v_associado_vendedor_id
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

    v_participa := false;
    if coalesce(v_evento.pedir_participacao, false)
       and p_participa is not null
       and cardinality(p_participa) >= v_n then
      v_participa := coalesce(p_participa[v_n], false);
    end if;

    v_eh_staff := false;
    v_convidado_ramo := null;
    if coalesce(v_evento.pedir_ramo, false) then
      if p_eh_staff is not null and cardinality(p_eh_staff) >= v_n then
        v_eh_staff := coalesce(p_eh_staff[v_n], false);
      end if;
      if not v_eh_staff
         and p_convidado_ramos is not null
         and cardinality(p_convidado_ramos) >= v_n
         and p_convidado_ramos[v_n] in (1, 2, 3, 4) then
        v_convidado_ramo := p_convidado_ramos[v_n];
      end if;
    end if;

    v_info_extra := null;
    if coalesce(v_evento.pedir_info_extra, false)
       and p_infos_extra is not null
       and cardinality(p_infos_extra) >= v_n then
      v_info_extra := nullif(left(btrim(coalesce(p_infos_extra[v_n], '')), 500), '');
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
      participa_atividade,
      convidado_ramo,
      eh_staff,
      info_extra,
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
      v_participa,
      v_convidado_ramo,
      v_eh_staff,
      v_info_extra,
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
  integer, text[], text, text, integer[], text[], boolean[], integer[], boolean[], text[]
) from public;
grant execute on function public.venda_evento_comprar(
  integer, text[], text, text, integer[], text[], boolean[], integer[], boolean[], text[]
) to authenticated;
