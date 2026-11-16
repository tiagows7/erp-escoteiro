-- Totais do Portal da Transparência materializados por período/caixa/seção.
-- Reduz tráfego: portal_resumo lê a tabela; regenera só se faltar ou estiver
-- marcada como desatualizada após movimento financeiro.

create table if not exists public.portal_totais (
  empresa_id integer not null references public.empresa (id) on delete cascade,
  ano integer not null,
  -- 0 = ano inteiro; 1..12 = mês
  mes integer not null default 0
    check (mes >= 0 and mes <= 12),
  -- -1 = geral; 0 = grupo; 1..4 = ramos
  caixa_id integer not null default -1,
  -- 0 = todas as seções
  secao_id integer not null default 0,
  saldo_inicial numeric(15, 2) not null default 0,
  total_receitas numeric(15, 2) not null default 0,
  total_despesas numeric(15, 2) not null default 0,
  saldo_final numeric(15, 2) not null default 0,
  despesas_pagas numeric(15, 2) not null default 0,
  receitas_recebidas numeric(15, 2) not null default 0,
  saldo_lancado numeric(15, 2) not null default 0,
  saldo_realizado numeric(15, 2) not null default 0,
  mensalidades_atraso numeric(15, 2) not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (empresa_id, ano, mes, caixa_id, secao_id)
);

create index if not exists portal_totais_empresa_ano_idx
  on public.portal_totais (empresa_id, ano, mes);

comment on table public.portal_totais is
  'Totais pré-calculados do Portal da Transparência (saldo inicial/final, receitas e despesas).';

alter table public.portal_totais enable row level security;

revoke all on table public.portal_totais from public;
revoke all on table public.portal_totais from anon;
revoke all on table public.portal_totais from authenticated;
grant select, insert, update, delete on table public.portal_totais to service_role;

-- Invalida totais do grupo (próxima consulta regenera).
create or replace function public.portal_totais_invalidate(p_empresa_id integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_empresa_id is null then
    return;
  end if;
  delete from public.portal_totais where empresa_id = p_empresa_id;
end;
$$;

revoke all on function public.portal_totais_invalidate(integer) from public;
grant execute on function public.portal_totais_invalidate(integer) to service_role;

create or replace function public.portal_totais_invalidate_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id integer;
begin
  v_empresa_id := coalesce(
    nullif(to_jsonb(new) ->> 'empresa_id', '')::integer,
    nullif(to_jsonb(old) ->> 'empresa_id', '')::integer
  );
  perform public.portal_totais_invalidate(v_empresa_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists portal_totais_inv_despesas on public.despesas;
create trigger portal_totais_inv_despesas
  after insert or update or delete on public.despesas
  for each row execute function public.portal_totais_invalidate_trigger();

drop trigger if exists portal_totais_inv_receitas on public.receitas;
create trigger portal_totais_inv_receitas
  after insert or update or delete on public.receitas
  for each row execute function public.portal_totais_invalidate_trigger();

drop trigger if exists portal_totais_inv_despesa_pag on public.despesa_pagamento;
create trigger portal_totais_inv_despesa_pag
  after insert or update or delete on public.despesa_pagamento
  for each row execute function public.portal_totais_invalidate_trigger();

drop trigger if exists portal_totais_inv_receita_pag on public.receita_pagamento;
create trigger portal_totais_inv_receita_pag
  after insert or update or delete on public.receita_pagamento
  for each row execute function public.portal_totais_invalidate_trigger();

drop trigger if exists portal_totais_inv_saldo_mov on public.empresa_saldo_local_movimento;
create trigger portal_totais_inv_saldo_mov
  after insert or update or delete on public.empresa_saldo_local_movimento
  for each row execute function public.portal_totais_invalidate_trigger();

-- Calcula e grava um recorte (empresa + período + caixa + seção).
create or replace function public.portal_totais_gerar(
  p_empresa_id integer,
  p_ano integer,
  p_mes integer default 0,
  p_caixa integer default -1,
  p_secao integer default 0
)
returns public.portal_totais
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mes integer := coalesce(p_mes, 0);
  v_caixa integer := coalesce(p_caixa, -1);
  v_secao integer := coalesce(p_secao, 0);
  v_periodo_inicio date;
  v_periodo_fim date;
  v_d_ant_pago numeric := 0;
  v_r_ant_recebido numeric := 0;
  v_d_pago numeric := 0;
  v_r_recebido numeric := 0;
  v_atraso numeric := 0;
  v_loc_resgatado numeric := 0;
  v_loc_aplicado numeric := 0;
  v_saldo_inicial numeric := 0;
  v_saldo_final numeric := 0;
  v_row public.portal_totais;
begin
  if p_empresa_id is null or p_ano is null then
    raise exception 'empresa_id e ano são obrigatórios';
  end if;
  if v_mes < 0 or v_mes > 12 then
    raise exception 'mês inválido';
  end if;

  if v_mes = 0 then
    v_periodo_inicio := make_date(p_ano, 1, 1);
    v_periodo_fim := make_date(p_ano + 1, 1, 1);
  else
    v_periodo_inicio := make_date(p_ano, v_mes, 1);
    v_periodo_fim :=
      case
        when v_mes = 12 then make_date(p_ano + 1, 1, 1)
        else make_date(p_ano, v_mes + 1, 1)
      end;
  end if;

  select
    coalesce(sum(despesa_valor - despesa_saldo), 0)::numeric
  into v_d_ant_pago
  from public.despesas
  where empresa_id = p_empresa_id
    and (
      v_caixa = -1
      or public._portal_caixa_id(despesa_ramo) = v_caixa
    )
    and (
      v_secao = 0
      or despesa_secao = v_secao
    )
    and despesa_emissao is not null
    and despesa_emissao < v_periodo_inicio;

  select
    coalesce(sum(receita_valor - receita_saldo), 0)::numeric
  into v_r_ant_recebido
  from public.receitas
  where empresa_id = p_empresa_id
    and (
      v_caixa = -1
      or public._portal_caixa_id(receita_ramo) = v_caixa
    )
    and (
      v_secao = 0
      or receita_secao = v_secao
    )
    and coalesce(receita_emissao, receita_competencia) is not null
    and coalesce(receita_emissao, receita_competencia) < v_periodo_inicio;

  select
    coalesce(sum(despesa_valor - despesa_saldo), 0)::numeric
  into v_d_pago
  from public.despesas
  where empresa_id = p_empresa_id
    and (
      v_caixa = -1
      or public._portal_caixa_id(despesa_ramo) = v_caixa
    )
    and (
      v_secao = 0
      or despesa_secao = v_secao
    )
    and despesa_emissao >= v_periodo_inicio
    and despesa_emissao < v_periodo_fim;

  select
    coalesce(sum(receita_valor - receita_saldo), 0)::numeric
  into v_r_recebido
  from public.receitas
  where empresa_id = p_empresa_id
    and (
      v_caixa = -1
      or public._portal_caixa_id(receita_ramo) = v_caixa
    )
    and (
      v_secao = 0
      or receita_secao = v_secao
    )
    and coalesce(receita_emissao, receita_competencia) >= v_periodo_inicio
    and coalesce(receita_emissao, receita_competencia) < v_periodo_fim;

  select coalesce(sum(rec.receita_saldo), 0)::numeric
  into v_atraso
  from public.receitas rec
  left join public.associados assoc on assoc.associado_id = rec.associado_id
  where rec.empresa_id = p_empresa_id
    and rec.receita_origem = 'M'
    and coalesce(rec.receita_saldo, 0) > 0
    and rec.receita_vencimento is not null
    and rec.receita_vencimento < current_date
    and (
      v_caixa = -1
      or v_caixa = 0
      or (
        v_caixa between 1 and 4
        and assoc.ramo = v_caixa
      )
    )
    and (
      v_secao = 0
      or assoc.secao = v_secao
    );

  select
    coalesce(sum(m.valor_resgatado), 0)::numeric,
    coalesce(sum(m.valor_aplicado), 0)::numeric
  into v_loc_resgatado, v_loc_aplicado
  from public.empresa_saldo_local_movimento m
  join public.empresa_saldo_local l
    on l.id = m.local_id
   and l.empresa_id = m.empresa_id
  where l.empresa_id = p_empresa_id
    and l.ativo = true
    and m.data_movimento < v_periodo_inicio
    and (
      v_caixa = -1
      or l.caixa_id = v_caixa
    )
    and (
      v_secao = 0
      or l.secao_id is null
      or l.secao_id = v_secao
    );

  v_saldo_inicial :=
    v_r_ant_recebido - v_d_ant_pago + v_loc_resgatado - v_loc_aplicado;
  v_saldo_final := v_saldo_inicial + v_r_recebido - v_d_pago;

  insert into public.portal_totais as t (
    empresa_id,
    ano,
    mes,
    caixa_id,
    secao_id,
    saldo_inicial,
    total_receitas,
    total_despesas,
    saldo_final,
    despesas_pagas,
    receitas_recebidas,
    saldo_lancado,
    saldo_realizado,
    mensalidades_atraso,
    atualizado_em
  )
  values (
    p_empresa_id,
    p_ano,
    v_mes,
    v_caixa,
    v_secao,
    v_saldo_inicial,
    v_r_recebido,
    v_d_pago,
    v_saldo_final,
    v_d_pago,
    v_r_recebido,
    (v_r_recebido - v_d_pago),
    (v_r_recebido - v_d_pago),
    v_atraso,
    now()
  )
  on conflict (empresa_id, ano, mes, caixa_id, secao_id) do update
  set
    saldo_inicial = excluded.saldo_inicial,
    total_receitas = excluded.total_receitas,
    total_despesas = excluded.total_despesas,
    saldo_final = excluded.saldo_final,
    despesas_pagas = excluded.despesas_pagas,
    receitas_recebidas = excluded.receitas_recebidas,
    saldo_lancado = excluded.saldo_lancado,
    saldo_realizado = excluded.saldo_realizado,
    mensalidades_atraso = excluded.mensalidades_atraso,
    atualizado_em = excluded.atualizado_em
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.portal_totais_gerar(integer, integer, integer, integer, integer) from public;
grant execute on function public.portal_totais_gerar(integer, integer, integer, integer, integer)
  to authenticated, service_role;

-- Gera caixas padrão (geral + grupo + 4 ramos) sem filtro de seção.
create or replace function public.portal_totais_gerar_periodo(
  p_empresa_id integer,
  p_ano integer,
  p_mes integer default 0
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caixa integer;
  v_qtd integer := 0;
begin
  foreach v_caixa in array array[-1, 0, 1, 2, 3, 4]
  loop
    perform public.portal_totais_gerar(
      p_empresa_id,
      p_ano,
      coalesce(p_mes, 0),
      v_caixa,
      0
    );
    v_qtd := v_qtd + 1;
  end loop;
  return v_qtd;
end;
$$;

revoke all on function public.portal_totais_gerar_periodo(integer, integer, integer) from public;
grant execute on function public.portal_totais_gerar_periodo(integer, integer, integer)
  to authenticated, service_role;

-- portal_resumo passa a usar a tabela (gera sob demanda se faltar).
create or replace function public.portal_resumo(
  p_slug text,
  p_ano integer default null,
  p_caixa integer default 0,
  p_secao integer default null,
  p_mes integer default null
)
returns table (
  total_despesas numeric,
  total_receitas numeric,
  despesas_pagas numeric,
  receitas_recebidas numeric,
  saldo_lancado numeric,
  saldo_realizado numeric,
  saldo_anterior numeric,
  saldo_final numeric,
  mensalidades_atraso numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id integer;
  v_ano integer;
  v_mes integer;
  v_caixa integer;
  v_secao integer;
  v_row public.portal_totais;
begin
  v_empresa_id := public.portal_resolve_empresa_id(p_slug);
  if v_empresa_id is null then
    return;
  end if;

  v_ano := coalesce(p_ano, extract(year from current_date)::integer);
  v_mes := case
    when p_mes is null or p_mes < 1 or p_mes > 12 then 0
    else p_mes
  end;
  v_caixa := coalesce(p_caixa, -1);
  v_secao := coalesce(p_secao, 0);

  select t.*
  into v_row
  from public.portal_totais t
  where t.empresa_id = v_empresa_id
    and t.ano = v_ano
    and t.mes = v_mes
    and t.caixa_id = v_caixa
    and t.secao_id = v_secao;

  if v_row.empresa_id is null then
    v_row := public.portal_totais_gerar(
      v_empresa_id,
      v_ano,
      v_mes,
      v_caixa,
      v_secao
    );
  end if;

  return query
  select
    v_row.total_despesas,
    v_row.total_receitas,
    v_row.despesas_pagas,
    v_row.receitas_recebidas,
    v_row.saldo_lancado,
    v_row.saldo_realizado,
    v_row.saldo_inicial as saldo_anterior,
    v_row.saldo_final,
    v_row.mensalidades_atraso;
end;
$$;

revoke all on function public.portal_resumo(text, integer, integer, integer, integer) from public;
grant execute on function public.portal_resumo(text, integer, integer, integer, integer)
  to anon, authenticated;
