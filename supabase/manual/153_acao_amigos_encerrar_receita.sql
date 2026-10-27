-- Ao encerrar a ação entre amigos, gera uma única receita com o total vendido.

alter table public.acao_entre_amigos
  add column if not exists receita_encerramento_id integer
    references public.receitas (receita_id) on delete set null;

create index if not exists acao_entre_amigos_receita_encerramento_idx
  on public.acao_entre_amigos (receita_encerramento_id);

comment on column public.acao_entre_amigos.receita_encerramento_id is
  'Receita única gerada no encerramento (total dos números vendidos).';

create or replace function public.acao_amigos_encerrar(p_acao_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acao public.acao_entre_amigos%rowtype;
  v_qtd integer := 0;
  v_total numeric(15, 2) := 0;
  v_receita_id integer;
  v_tipopagto_id integer;
  v_data date;
  v_descricao text;
  v_obs text;
  v_encerrado timestamptz;
begin
  if p_acao_id is null or p_acao_id <= 0 then
    raise exception 'Ação inválida.';
  end if;

  select * into v_acao
  from public.acao_entre_amigos a
  where a.acao_id = p_acao_id
  for update;

  if not found then
    raise exception 'Ação não encontrada.';
  end if;

  if auth.uid() is not null
     and not public.can_write_empresa(v_acao.empresa_id) then
    raise exception 'Sem permissão para encerrar esta ação.';
  end if;

  v_encerrado := coalesce(v_acao.encerrado_em, now());
  if v_acao.encerrado_em is null then
    update public.acao_entre_amigos
    set encerrado_em = v_encerrado
    where acao_id = p_acao_id;
  end if;

  if v_acao.receita_encerramento_id is not null then
    return jsonb_build_object(
      'ok', true,
      'encerrado_em', v_encerrado,
      'receita_id', v_acao.receita_encerramento_id,
      'qtd_vendidos', null,
      'valor', null,
      'reused', true
    );
  end if;

  select count(*)::integer
    into v_qtd
  from public.acao_entre_amigos_venda v
  where v.acao_id = p_acao_id
    and v.empresa_id = v_acao.empresa_id;

  v_total := round(coalesce(v_acao.valor_numero, 0) * v_qtd, 2);
  v_data := (v_encerrado at time zone 'America/Sao_Paulo')::date;

  if v_total <= 0 or v_qtd <= 0 then
    return jsonb_build_object(
      'ok', true,
      'encerrado_em', v_encerrado,
      'receita_id', null,
      'qtd_vendidos', v_qtd,
      'valor', 0,
      'reused', false
    );
  end if;

  v_descricao := left(
    'Ação entre amigos: ' || coalesce(v_acao.nome, 'Ação') ||
    ' · ' || v_qtd::text || ' número(s)',
    120
  );
  v_obs := left(
    'Encerramento · total vendido · ' || v_qtd::text ||
    ' × ' || to_char(coalesce(v_acao.valor_numero, 0), 'FM999999990.00'),
    200
  );

  insert into public.receitas (
    empresa_id,
    receita_origem,
    receita_descricao,
    receita_ramo,
    receita_secao,
    acao_id,
    receita_tipo_id,
    receita_emissao,
    receita_vencimento,
    receita_valor,
    receita_saldo,
    receita_situacao,
    receita_observacao
  ) values (
    v_acao.empresa_id,
    'A',
    v_descricao,
    v_acao.ramo,
    v_acao.secao,
    v_acao.acao_id,
    v_acao.receita_tipo_id,
    v_data,
    v_data,
    v_total,
    0,
    3,
    v_obs
  )
  returning receita_id into v_receita_id;

  v_tipopagto_id := public.venda_evento_ensure_tipopagto(
    v_acao.empresa_id,
    'dinheiro'
  );

  insert into public.receita_pagamento (
    empresa_id,
    receita_id,
    tipopagto_id,
    data_pagamento,
    valor,
    observacao
  ) values (
    v_acao.empresa_id,
    v_receita_id,
    v_tipopagto_id,
    v_data,
    v_total,
    left('Recebimento encerramento ação #' || p_acao_id::text, 200)
  );

  update public.acao_entre_amigos
  set receita_encerramento_id = v_receita_id
  where acao_id = p_acao_id;

  return jsonb_build_object(
    'ok', true,
    'encerrado_em', v_encerrado,
    'receita_id', v_receita_id,
    'qtd_vendidos', v_qtd,
    'valor', v_total,
    'reused', false
  );
end;
$$;

revoke all on function public.acao_amigos_encerrar(integer) from public;
grant execute on function public.acao_amigos_encerrar(integer)
  to authenticated, service_role;
