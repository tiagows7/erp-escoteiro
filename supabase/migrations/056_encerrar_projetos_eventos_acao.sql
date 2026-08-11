-- Encerrar projetos, eventos e ação entre amigos (somente visualização após)

alter table public.projetos
  add column if not exists encerrado_em timestamptz;

alter table public.venda_eventos
  add column if not exists encerrado_em timestamptz;

alter table public.acao_entre_amigos
  add column if not exists encerrado_em timestamptz;

comment on column public.projetos.encerrado_em is
  'Quando preenchido, o projeto fica encerrado (somente visualização).';
comment on column public.venda_eventos.encerrado_em is
  'Quando preenchido, o evento fica encerrado (sem novas vendas/lançamentos).';
comment on column public.acao_entre_amigos.encerrado_em is
  'Quando preenchido, a ação fica encerrada (sem novas vendas).';

-- Compra de convites: bloqueia se evento encerrado
create or replace function public.venda_evento_comprar(
  p_evento_id integer,
  p_nomes text[],
  p_comprador_telefone text default null,
  p_forma_pagamento text default null
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
  v_valor numeric(15, 2);
  v_fone text;
  v_forma text;
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

  v_valor := round(coalesce(v_evento.valor_convite, 0) * v_qtde, 2);

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
    insert into public.venda_evento_convite (
      empresa_id,
      evento_id,
      compra_id,
      numero,
      nome
    ) values (
      v_evento.empresa_id,
      v_evento.evento_id,
      v_compra_id,
      v_free[v_n],
      v_nomes[v_n]
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

revoke all on function public.venda_evento_comprar(integer, text[], text, text)
  from public;
grant execute on function public.venda_evento_comprar(integer, text[], text, text)
  to authenticated;

-- Info pública do evento
drop function if exists public.venda_evento_public_info(uuid);

create or replace function public.venda_evento_public_info(p_token uuid)
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
  encerrado boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento public.venda_eventos%rowtype;
  v_vendidos integer;
  v_total integer;
begin
  select * into v_evento
  from public.venda_eventos e
  where e.link_token = p_token;

  if not found then
    return;
  end if;

  v_total := v_evento.numero_final - v_evento.numero_inicial + 1;
  if v_total < 0 then
    v_total := 0;
  end if;

  select count(*)::integer into v_vendidos
  from public.venda_evento_convite c
  where c.evento_id = v_evento.evento_id;

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
    (v_evento.encerrado_em is not null)
  from public.empresa e
  where e.id = v_evento.empresa_id;
end;
$$;

revoke all on function public.venda_evento_public_info(uuid) from public;
grant execute on function public.venda_evento_public_info(uuid)
  to anon, authenticated;

-- Info pública da ação entre amigos
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
  encerrado boolean
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
    (a.encerrado_em is not null)
  from public.acao_entre_amigos a
  join public.empresa e on e.id = a.empresa_id
  left join public.associados assoc on assoc.associado_id = v_faixa.associado_id
  where a.acao_id = v_faixa.acao_id
    and a.empresa_id = v_faixa.empresa_id;
end;
$$;

revoke all on function public.acao_amigos_public_info(uuid) from public;
grant execute on function public.acao_amigos_public_info(uuid) to anon, authenticated;

-- Venda pública da ação: bloqueia se encerrada
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

  if v_acao.encerrado_em is not null then
    return query select false, 'Esta ação entre amigos está encerrada.'::text, '{}'::integer[];
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
