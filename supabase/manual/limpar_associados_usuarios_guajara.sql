-- Limpa associados + usuários do grupo g-e-guajara-mirim (empresa_id = 1).
-- Mantém o cadastro do grupo (empresa) e estrutura (seção, etc.).
-- Mantém profiles super_admin (plataforma).

do $$
declare
  v_empresa integer := 1;
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

  if v_slug is distinct from 'g-e-guajara-mirim' then
    raise exception 'Slug esperado g-e-guajara-mirim, encontrado: %', coalesce(v_slug, '(null)');
  end if;

  raise notice 'Limpando associados/usuários: % (%)', v_nome, v_slug;

  -- Filhos que referenciam associados / financeiro do grupo
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
  if to_regclass('public.venda_eventos') is not null then
    delete from public.venda_eventos where empresa_id = v_empresa;
  end if;

  -- Associados
  delete from public.associados where empresa_id = v_empresa;
  get diagnostics n_associados = row_count;

  -- Usuários do grupo (auth.users; profiles em cascade ou limpeza residual)
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

  raise notice 'Removidos associados=%, users=%', n_associados, n_users;
end $$;
