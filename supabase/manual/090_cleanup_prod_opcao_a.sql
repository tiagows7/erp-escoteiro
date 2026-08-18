-- Limpeza opção A: zera dados operacionais para início de produção.
-- MANTÉM: ramos, estado, cidade, categoria, funcao,
--          plataforma_plano, plataforma_efi_pix,
--          profiles com role = super_admin.
-- Auth users extras: limpar com scripts/cleanup-prod-auth.mjs

begin;

-- Operacional / tenant
truncate table
  public.loja_pedido_item,
  public.loja_pedido,
  public.infinitepay_pedidos,
  public.acao_entre_amigos_venda,
  public.acao_entre_amigos_faixa,
  public.acao_entre_amigos,
  public.venda_evento_compra,
  public.venda_evento_convite,
  public.venda_eventos,
  public.venda_evento_tipo,
  public.atividade_pagamento,
  public.atividade_confirmacao,
  public.atividades,
  public.receita_pagamento,
  public.receitas,
  public.despesa_pagamento,
  public.despesas,
  public.pix_cobrancas,
  public.movimento_estoque,
  public.produto_custo,
  public.produto_preco,
  public.produto,
  public.grupo_produto,
  public.fornecedor_despesa,
  public.associados,
  public.secao_nome,
  public.secao,
  public.tipo_mensalidade,
  public.tipo_pagamento,
  public.projetos,
  public.calendario_grupo,
  public.empresa_conta_bancaria,
  public.empresa_ramo_pix_sicredi,
  public.empresa_saldo_local,
  public.lgpd_consentimento_log,
  public.auditoria_log,
  public.sugestao_melhoria,
  public.plataforma_pix_cobrancas,
  public.plataforma_cobranca_pagamento,
  public.plataforma_cobranca
restart identity cascade;

-- Super admin fica sem grupo (vai cadastrar grupos novos)
update public.profiles
set empresa_id = null
where role = 'super_admin';

delete from public.profiles
where role is distinct from 'super_admin';

-- Sem CASCADE: não apaga profiles (já tratados)
delete from public.empresa;

-- Reinicia sequence de empresa se existir
do $$
declare
  seq text;
begin
  select pg_get_serial_sequence('public.empresa', 'id') into seq;
  if seq is not null then
    execute format('alter sequence %s restart with 1', seq);
  end if;
end $$;

commit;

-- Conferência
select 'profiles' as tabela, count(*)::text as qtd from public.profiles
union all select 'empresa', count(*)::text from public.empresa
union all select 'associados', count(*)::text from public.associados
union all select 'receitas', count(*)::text from public.receitas
union all select 'despesas', count(*)::text from public.despesas
union all select 'plataforma_plano', count(*)::text from public.plataforma_plano
union all select 'plataforma_efi_pix', count(*)::text from public.plataforma_efi_pix
union all select 'ramos', count(*)::text from public.ramos
union all select 'super_admin', count(*)::text from public.profiles where role = 'super_admin';
