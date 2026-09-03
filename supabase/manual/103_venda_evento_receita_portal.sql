-- Receita automática das vendas de convite (portal da transparência / caixa)

alter table public.venda_evento_compra
  add column if not exists receita_id integer
    references public.receitas (receita_id) on delete set null;

create index if not exists venda_evento_compra_receita_idx
  on public.venda_evento_compra (receita_id);

comment on column public.venda_evento_compra.receita_id is
  'Receita quitada gerada pela venda — alimenta o portal da transparência.';

-- Evita conflito de identity após migração de dados
select setval(
  pg_get_serial_sequence('public.receitas', 'receita_id'),
  coalesce((select max(receita_id) from public.receitas), 1),
  true
);
select setval(
  pg_get_serial_sequence('public.receita_pagamento', 'pagamento_id'),
  coalesce((select max(pagamento_id) from public.receita_pagamento), 1),
  true
);
select setval(
  pg_get_serial_sequence('public.tipo_pagamento', 'tipopagto_id'),
  coalesce((select max(tipopagto_id) from public.tipo_pagamento), 1),
  true
);

create or replace function public.venda_evento_ensure_tipopagto(
  p_empresa_id integer,
  p_forma text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
  v_id integer;
  v_comunica boolean := false;
begin
  if lower(coalesce(p_forma, '')) in ('pix', 'pix_direto', 'infinitepay') then
    v_nome := 'PIX';
    v_comunica := true;
  else
    v_nome := 'Dinheiro';
  end if;

  select t.tipopagto_id into v_id
  from public.tipo_pagamento t
  where t.empresa_id = p_empresa_id
    and lower(t.nome) = lower(v_nome)
  order by t.tipopagto_id
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.tipo_pagamento (empresa_id, nome, quita, comunica_banco)
  values (p_empresa_id, v_nome, true, v_comunica)
  returning tipopagto_id into v_id;

  return v_id;
end;
$$;

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
  v_tipopagto_id := public.venda_evento_ensure_tipopagto(
    v_compra.empresa_id,
    v_forma
  );

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
    (coalesce(v_compra.vendido_em, now()) at time zone 'America/Sao_Paulo')::date,
    (coalesce(v_compra.vendido_em, now()) at time zone 'America/Sao_Paulo')::date,
    round(v_compra.valor, 2),
    0,
    3,
    v_obs
  )
  returning receita_id into v_receita_id;

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
    (coalesce(v_compra.vendido_em, now()) at time zone 'America/Sao_Paulo')::date,
    round(v_compra.valor, 2),
    left('Recebimento venda de convites #' || v_compra.compra_id::text, 200)
  );

  update public.venda_evento_compra
  set receita_id = v_receita_id
  where compra_id = v_compra.compra_id;

  return v_receita_id;
end;
$$;

revoke all on function public.venda_evento_ensure_tipopagto(integer, text) from public;
grant execute on function public.venda_evento_ensure_tipopagto(integer, text)
  to authenticated, service_role;

revoke all on function public.venda_evento_gerar_receita(integer) from public;
grant execute on function public.venda_evento_gerar_receita(integer)
  to authenticated, service_role;

create or replace function public.venda_evento_compra_ai_receita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.venda_evento_gerar_receita(new.compra_id);
  return new;
end;
$$;

drop trigger if exists venda_evento_compra_ai_receita
  on public.venda_evento_compra;
create trigger venda_evento_compra_ai_receita
  after insert on public.venda_evento_compra
  for each row
  execute function public.venda_evento_compra_ai_receita();

-- Backfill: vendas já feitas sem receita
do $$
declare
  r record;
begin
  for r in
    select c.compra_id
    from public.venda_evento_compra c
    where c.receita_id is null
      and coalesce(c.valor, 0) > 0
    order by c.compra_id
  loop
    begin
      perform public.venda_evento_gerar_receita(r.compra_id);
    exception
      when others then
        raise notice 'Falha ao gerar receita da compra %: %', r.compra_id, SQLERRM;
    end;
  end loop;
end $$;
