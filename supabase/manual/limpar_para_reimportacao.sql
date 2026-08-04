-- =============================================================================
-- Limpeza para REIMPORTAÇÃO de associados (+ financeiro / atividades / usuários)
-- NÃO é migration — rode o script INTEIRO de uma vez no SQL Editor do Supabase.
-- =============================================================================
--
-- MANTÉM:
--   empresa, secao, secao_nome, tipo_mensalidade, tipo_pagamento,
--   ramos, estado, cidade, categoria, funcao,
--   empresa_conta_bancaria, empresa_ramo_pix_sicredi, empresa_saldo_local,
--   profiles/auth de super_admin (plataforma)
--
-- APAGA (do grupo informado):
--   PIX, pagamentos, receitas, despesas, atividades, associados,
--   estoque (se existir), fornecedores de despesa,
--   TODOS os usuários do grupo, inclusive admin
--   (atenção: se apagar o seu próprio login, precisará recriar o acesso)
--
-- =============================================================================

do $$
declare
  -- >>> AJUSTE O ID DO GRUPO AQUI <<<
  -- Confira com: select id, nome from public.empresa order by id;
  v_empresa integer := 1;

  v_nome text;
  n_pix integer;
  n_rec_pag integer;
  n_desp_pag integer;
  n_at_conf integer;
  n_at_pag integer;
  n_receitas integer;
  n_despesas integer;
  n_atividades integer;
  n_associados integer;
  n_fornecedor integer;
  n_users integer;
begin
  select e.nome into v_nome
  from public.empresa e
  where e.id = v_empresa;

  if v_nome is null then
    raise exception 'empresa_id % não encontrado. Ajuste v_empresa no início do script.', v_empresa;
  end if;

  raise notice 'Limpando dados do grupo % (%)', v_empresa, v_nome;

  -- 1) PIX
  delete from public.pix_cobrancas
  where empresa_id = v_empresa;
  get diagnostics n_pix = row_count;

  -- 2) Pagamentos
  delete from public.receita_pagamento
  where empresa_id = v_empresa;
  get diagnostics n_rec_pag = row_count;

  delete from public.despesa_pagamento
  where empresa_id = v_empresa;
  get diagnostics n_desp_pag = row_count;

  -- 3) Atividades (filhos)
  delete from public.atividade_confirmacao
  where empresa_id = v_empresa;
  get diagnostics n_at_conf = row_count;

  delete from public.atividade_pagamento
  where empresa_id = v_empresa;
  get diagnostics n_at_pag = row_count;

  -- 4) Receitas e despesas (antes de associados)
  delete from public.receitas
  where empresa_id = v_empresa;
  get diagnostics n_receitas = row_count;

  delete from public.despesas
  where empresa_id = v_empresa;
  get diagnostics n_despesas = row_count;

  -- 5) Atividades
  delete from public.atividades
  where empresa_id = v_empresa;
  get diagnostics n_atividades = row_count;

  -- 6) Estoque (se existir)
  if to_regclass('public.movimento_estoque') is not null then
    execute format('delete from public.movimento_estoque where empresa_id = %s', v_empresa);
  end if;
  if to_regclass('public.produto_custo') is not null then
    execute format('delete from public.produto_custo where empresa_id = %s', v_empresa);
  end if;
  if to_regclass('public.produto_preco') is not null then
    execute format('delete from public.produto_preco where empresa_id = %s', v_empresa);
  end if;
  if to_regclass('public.produto') is not null then
    execute format('delete from public.produto where empresa_id = %s', v_empresa);
  end if;
  if to_regclass('public.grupo_produto') is not null then
    execute format('delete from public.grupo_produto where empresa_id = %s', v_empresa);
  end if;

  -- 7) Fornecedores / contatos
  delete from public.fornecedor_despesa
  where empresa_id = v_empresa;
  get diagnostics n_fornecedor = row_count;

  -- 8) Associados
  delete from public.associados
  where empresa_id = v_empresa;
  get diagnostics n_associados = row_count;

  -- 9) Usuários (inclui admin; mantém só super_admin da plataforma)
  -- auth.users precisa ser apagado para remover o login; profiles cai em CASCADE.
  with alvo as (
    select p.id
    from public.profiles p
    where p.empresa_id = v_empresa
      and p.role is distinct from 'super_admin'::public.app_role
  )
  delete from auth.users u
  using alvo
  where u.id = alvo.id;
  get diagnostics n_users = row_count;

  delete from public.profiles p
  where p.empresa_id = v_empresa
    and p.role is distinct from 'super_admin'::public.app_role;

  raise notice 'Removidos — pix:%, rec_pag:%, desp_pag:%, at_conf:%, at_pag:%, receitas:%, despesas:%, atividades:%, fornecedor:%, associados:%, users:%',
    n_pix, n_rec_pag, n_desp_pag, n_at_conf, n_at_pag, n_receitas, n_despesas, n_atividades, n_fornecedor, n_associados, n_users;
end $$;

-- Conferência (rode depois; ajuste o id se necessário)
select
  (select count(*) from public.associados where empresa_id = 1) as associados,
  (select count(*) from public.receitas where empresa_id = 1) as receitas,
  (select count(*) from public.despesas where empresa_id = 1) as despesas,
  (select count(*) from public.atividades where empresa_id = 1) as atividades,
  (select count(*) from public.pix_cobrancas where empresa_id = 1) as pix,
  (select count(*) from public.profiles where empresa_id = 1) as usuarios_restantes;
