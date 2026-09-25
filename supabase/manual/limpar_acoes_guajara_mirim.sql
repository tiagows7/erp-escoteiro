-- Exclui ações entre amigos do grupo g-e-guajara-mirim
-- e receitas/despesas (com pagamentos) geradas para elas.

do $$
declare
  v_empresa integer := 1;
  v_slug text;
  v_nome text;
  n_rec_pag integer := 0;
  n_desp_pag integer := 0;
  n_receitas integer := 0;
  n_despesas integer := 0;
  n_pix integer := 0;
  n_vendas integer := 0;
  n_faixas integer := 0;
  n_acoes integer := 0;
begin
  select e.nome, e.slug into v_nome, v_slug
  from public.empresa e
  where e.id = v_empresa;

  if v_nome is null then
    raise exception 'empresa_id % não encontrado', v_empresa;
  end if;

  if v_slug is distinct from 'g-e-guajara-mirim' then
    raise exception
      'Slug esperado g-e-guajara-mirim, encontrado: %',
      coalesce(v_slug, '(null)');
  end if;

  raise notice 'Limpando ações entre amigos: % (%)', v_nome, v_slug;

  -- 1) Pagamentos das receitas vinculadas às ações
  delete from public.receita_pagamento rp
  using public.receitas r
  where rp.receita_id = r.receita_id
    and r.empresa_id = v_empresa
    and r.acao_id is not null;
  get diagnostics n_rec_pag = row_count;

  -- 2) Pagamentos das despesas vinculadas às ações
  delete from public.despesa_pagamento dp
  using public.despesas d
  where dp.despesa_id = d.despesa_id
    and d.empresa_id = v_empresa
    and d.acao_id is not null;
  get diagnostics n_desp_pag = row_count;

  -- 3) Receitas / despesas da ação (precisa antes de apagar a ação,
  --    pois o FK é on delete set null)
  delete from public.receitas
  where empresa_id = v_empresa
    and acao_id is not null;
  get diagnostics n_receitas = row_count;

  delete from public.despesas
  where empresa_id = v_empresa
    and acao_id is not null;
  get diagnostics n_despesas = row_count;

  -- 4) PIX das ações
  if to_regclass('public.pix_cobrancas') is not null then
    delete from public.pix_cobrancas
    where empresa_id = v_empresa
      and acao_id is not null;
    get diagnostics n_pix = row_count;
  end if;

  -- 5) Vendas / faixas (cascade também, mas explícito)
  if to_regclass('public.acao_entre_amigos_venda') is not null then
    delete from public.acao_entre_amigos_venda where empresa_id = v_empresa;
    get diagnostics n_vendas = row_count;
  end if;

  if to_regclass('public.acao_entre_amigos_faixa') is not null then
    delete from public.acao_entre_amigos_faixa where empresa_id = v_empresa;
    get diagnostics n_faixas = row_count;
  end if;

  -- 6) Ações
  delete from public.acao_entre_amigos where empresa_id = v_empresa;
  get diagnostics n_acoes = row_count;

  raise notice
    'Removidos — rec_pag:%, desp_pag:%, receitas:%, despesas:%, pix:%, vendas:%, faixas:%, acoes:%',
    n_rec_pag, n_desp_pag, n_receitas, n_despesas, n_pix, n_vendas, n_faixas, n_acoes;
end $$;

select
  (select count(*) from public.acao_entre_amigos where empresa_id = 1) as acoes,
  (select count(*) from public.acao_entre_amigos_venda where empresa_id = 1) as vendas,
  (select count(*) from public.acao_entre_amigos_faixa where empresa_id = 1) as faixas,
  (select count(*) from public.receitas where empresa_id = 1 and acao_id is not null) as receitas_acao,
  (select count(*) from public.despesas where empresa_id = 1 and acao_id is not null) as despesas_acao;
