-- Limpa dados importados do grupo grupo-escoteiro-caio-viana-martins (empresa_id = 3).
-- Mantém: empresa, seções, tipagens, contas PIX, admin do grupo.
-- Remove: associados + filhos, financeiro/eventos do grupo, logins de importação (não-admin).

do $$
declare
  v_empresa integer := 3;
  v_slug text;
  v_nome text;
  n_associados integer := 0;
  n_users integer := 0;
begin
  select e.nome, e.slug into v_nome, v_slug
  from public.empresa e
  where e.id = v_empresa;

  if v_nome is null then
    raise exception 'empresa_id % não encontrado', v_empresa;
  end if;

  if v_slug is distinct from 'grupo-escoteiro-caio-viana-martins' then
    raise exception
      'Slug esperado grupo-escoteiro-caio-viana-martins, encontrado: %',
      coalesce(v_slug, '(null)');
  end if;

  raise notice 'Limpando dados importados: % (%)', v_nome, v_slug;

  -- Eventos / loja / ação entre amigos (filhos de associados ou do grupo)
  if to_regclass('public.venda_evento_vendedor') is not null then
    delete from public.venda_evento_vendedor where empresa_id = v_empresa;
  end if;
  if to_regclass('public.venda_evento_convite') is not null then
    delete from public.venda_evento_convite where empresa_id = v_empresa;
  end if;
  if to_regclass('public.venda_evento_compra') is not null then
    delete from public.venda_evento_compra where empresa_id = v_empresa;
  end if;
  if to_regclass('public.venda_evento_tipo') is not null then
    delete from public.venda_evento_tipo where empresa_id = v_empresa;
  end if;
  if to_regclass('public.venda_eventos') is not null then
    delete from public.venda_eventos where empresa_id = v_empresa;
  end if;

  if to_regclass('public.acao_entre_amigos_venda') is not null then
    delete from public.acao_entre_amigos_venda where empresa_id = v_empresa;
  end if;
  if to_regclass('public.acao_entre_amigos_faixa') is not null then
    delete from public.acao_entre_amigos_faixa where empresa_id = v_empresa;
  end if;
  if to_regclass('public.acao_entre_amigos') is not null then
    delete from public.acao_entre_amigos where empresa_id = v_empresa;
  end if;

  if to_regclass('public.loja_pedido_item') is not null then
    delete from public.loja_pedido_item
    where pedido_id in (
      select pedido_id from public.loja_pedido where empresa_id = v_empresa
    );
  end if;
  if to_regclass('public.loja_pedido') is not null then
    delete from public.loja_pedido where empresa_id = v_empresa;
  end if;

  if to_regclass('public.pix_cobrancas') is not null then
    delete from public.pix_cobrancas where empresa_id = v_empresa;
  end if;
  if to_regclass('public.receita_pagamento') is not null then
    delete from public.receita_pagamento where empresa_id = v_empresa;
  end if;
  if to_regclass('public.despesa_pagamento') is not null then
    delete from public.despesa_pagamento where empresa_id = v_empresa;
  end if;
  if to_regclass('public.atividade_confirmacao') is not null then
    delete from public.atividade_confirmacao where empresa_id = v_empresa;
  end if;
  if to_regclass('public.atividade_pagamento') is not null then
    delete from public.atividade_pagamento where empresa_id = v_empresa;
  end if;
  if to_regclass('public.receitas') is not null then
    delete from public.receitas where empresa_id = v_empresa;
  end if;
  if to_regclass('public.despesas') is not null then
    delete from public.despesas where empresa_id = v_empresa;
  end if;
  if to_regclass('public.atividades') is not null then
    delete from public.atividades where empresa_id = v_empresa;
  end if;
  if to_regclass('public.lgpd_consentimento_log') is not null then
    delete from public.lgpd_consentimento_log where empresa_id = v_empresa;
  end if;
  if to_regclass('public.conquistas') is not null then
    delete from public.conquistas where empresa_id = v_empresa;
  end if;
  if to_regclass('public.competicao_pontuacao') is not null then
    delete from public.competicao_pontuacao where empresa_id = v_empresa;
  end if;
  if to_regclass('public.competicao_equipe_membro') is not null then
    delete from public.competicao_equipe_membro where empresa_id = v_empresa;
  end if;
  if to_regclass('public.competicao_equipe') is not null then
    delete from public.competicao_equipe where empresa_id = v_empresa;
  end if;
  if to_regclass('public.competicoes') is not null then
    delete from public.competicoes where empresa_id = v_empresa;
  end if;

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
  if to_regclass('public.fornecedor_despesa') is not null then
    delete from public.fornecedor_despesa where empresa_id = v_empresa;
  end if;

  -- Associados
  delete from public.associados where empresa_id = v_empresa;
  get diagnostics n_associados = row_count;

  -- Logins de importação / registro (mantém admin e staff do grupo)
  with alvo as (
    select p.id
    from public.profiles p
    where p.empresa_id = v_empresa
      and p.role is distinct from 'super_admin'::public.app_role
      and p.role is distinct from 'admin'::public.app_role
  )
  delete from auth.users u
  using alvo
  where u.id = alvo.id;
  get diagnostics n_users = row_count;

  delete from public.profiles p
  where p.empresa_id = v_empresa
    and p.role is distinct from 'super_admin'::public.app_role
    and p.role is distinct from 'admin'::public.app_role;

  raise notice 'Removidos associados=%, users_nao_admin=%', n_associados, n_users;
end $$;

select
  (select count(*) from public.associados where empresa_id = 3) as associados,
  (select count(*) from public.profiles where empresa_id = 3) as usuarios,
  (select count(*) from public.receitas where empresa_id = 3) as receitas,
  (select count(*) from public.despesas where empresa_id = 3) as despesas;
