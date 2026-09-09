-- Hardening de segurança: segredos bancários, RPCs DEFINER, rifa pública,
-- financeiro RLS e cron de poll PIX.

-- ---------------------------------------------------------------------------
-- 1) Segredos PIX/bancários: sem SELECT para client
-- ---------------------------------------------------------------------------
revoke select (
  api_client_secret,
  api_pix_cert,
  api_pix_key
) on public.empresa_conta_bancaria from authenticated;

revoke select (
  api_client_secret,
  api_pix_cert,
  api_pix_key
) on public.empresa_conta_bancaria from anon;

-- Garantia: SELECT só em colunas públicas (evita GRANT TABLE reabrir segredos)
revoke select on public.empresa_conta_bancaria from authenticated;
revoke select on public.empresa_conta_bancaria from anon;

grant select (
  id,
  empresa_id,
  ramo_id,
  secao_id,
  descricao,
  banco_nome,
  agencia,
  conta,
  api_client_id,
  api_pix_chave,
  api_pix_ativo,
  api_pix_base_url,
  infinitepay_handle,
  has_api_client_secret,
  has_api_pix_cert,
  has_api_pix_key,
  created_at,
  updated_at
) on public.empresa_conta_bancaria to authenticated;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'empresa'
      and column_name = 'sicredi_pix_client_secret'
  ) then
    execute 'revoke select (sicredi_pix_client_secret, sicredi_pix_cert, sicredi_pix_key) on public.empresa from authenticated';
    execute 'revoke select (sicredi_pix_client_secret, sicredi_pix_cert, sicredi_pix_key) on public.empresa from anon';
  end if;

  if to_regclass('public.empresa_ramo_pix_sicredi') is not null then
    begin
      execute 'revoke select (sicredi_pix_client_secret, sicredi_pix_cert, sicredi_pix_key) on public.empresa_ramo_pix_sicredi from authenticated';
      execute 'revoke select (sicredi_pix_client_secret, sicredi_pix_cert, sicredi_pix_key) on public.empresa_ramo_pix_sicredi from anon';
    exception
      when undefined_column then
        null;
    end;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Helpers DEFINER: só service_role / owner (triggers continuam ok)
-- ---------------------------------------------------------------------------
revoke all on function public.harden_tenant_write_policies(text, text) from public;
revoke all on function public.harden_tenant_write_policies(text, text) from anon;
revoke all on function public.harden_tenant_write_policies(text, text) from authenticated;
grant execute on function public.harden_tenant_write_policies(text, text)
  to service_role;

revoke all on function public.produto_recalc_estoque(integer) from public;
revoke all on function public.produto_recalc_estoque(integer) from anon;
revoke all on function public.produto_recalc_estoque(integer) from authenticated;
grant execute on function public.produto_recalc_estoque(integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3) Rifa: bloquear venda pública sem pagamento
-- ---------------------------------------------------------------------------
revoke all on function public.acao_amigos_public_vender(uuid, integer[], text, text)
  from public;
revoke all on function public.acao_amigos_public_vender(uuid, integer[], text, text)
  from anon;
revoke all on function public.acao_amigos_public_vender(uuid, integer[], text, text)
  from authenticated;

-- ---------------------------------------------------------------------------
-- 4) venda_evento_* DEFINER: checagem de tenant + revoke de client
-- ---------------------------------------------------------------------------
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
  if p_empresa_id is null then
    raise exception 'Empresa inválida.';
  end if;

  -- Chamadas autenticadas (não service) precisam poder escrever no grupo
  if auth.uid() is not null
     and not public.can_write_empresa(p_empresa_id) then
    raise exception 'Sem permissão para tipo de pagamento deste grupo.';
  end if;

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

  if auth.uid() is not null
     and not public.can_write_empresa(v_compra.empresa_id) then
    raise exception 'Sem permissão para gerar receita desta venda.';
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

revoke all on function public.venda_evento_ensure_tipopagto(integer, text)
  from public;
revoke all on function public.venda_evento_ensure_tipopagto(integer, text)
  from anon;
revoke all on function public.venda_evento_ensure_tipopagto(integer, text)
  from authenticated;
grant execute on function public.venda_evento_ensure_tipopagto(integer, text)
  to service_role;

revoke all on function public.venda_evento_gerar_receita(integer) from public;
revoke all on function public.venda_evento_gerar_receita(integer) from anon;
revoke all on function public.venda_evento_gerar_receita(integer) from authenticated;
grant execute on function public.venda_evento_gerar_receita(integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5) Financeiro: escrita só admin/tesoureiro/super_admin
-- ---------------------------------------------------------------------------
do $$
begin
  perform public.harden_tenant_write_policies(
    'receitas',
    'can_write_financeiro'
  );
  perform public.harden_tenant_write_policies(
    'receita_pagamento',
    'can_write_financeiro'
  );
  perform public.harden_tenant_write_policies(
    'despesas',
    'can_write_financeiro'
  );
  perform public.harden_tenant_write_policies(
    'despesa_pagamento',
    'can_write_financeiro'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Cron poll PIX: exigir segredo no body (operador deve alinhar o secret)
-- ---------------------------------------------------------------------------
-- O job existente sem segredo deixa de funcionar até atualizar o body com
-- poll_secret igual a PIX_SICREDI_POLL_SECRET / PIX_SICREDI_WEBHOOK_SECRET.
do $$
declare
  v_jobid bigint;
begin
  select j.jobid into v_jobid
  from cron.job j
  where j.jobname = 'pix-sicredi-poll-pending'
  limit 1;

  if v_jobid is null then
    return;
  end if;

  -- Mantém o job; documentação no comentário. Não embute secret no repositório.
  raise notice
    'Atualize o cron pix-sicredi-poll-pending para enviar poll_secret no body.';
exception
  when undefined_table then
    null;
end;
$$;
