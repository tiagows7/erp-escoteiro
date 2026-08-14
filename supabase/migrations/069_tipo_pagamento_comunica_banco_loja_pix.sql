-- Tipo de pagamento: comunica com banco (PIX Sicredi)
-- Cobrança PIX da loja (PDV)

alter table public.tipo_pagamento
  add column if not exists comunica_banco boolean not null default false;

comment on column public.tipo_pagamento.comunica_banco is
  'Se verdadeiro, na Loja abre cobrança PIX Sicredi (quando configurado) em vez de baixar na hora.';

alter table public.pix_cobrancas
  drop constraint if exists pix_cobrancas_tipo_check;

alter table public.pix_cobrancas
  add constraint pix_cobrancas_tipo_check
  check (
    tipo in (
      'mensalidade',
      'atividade',
      'mensalidade_lote',
      'acao_entre_amigos',
      'venda_evento',
      'loja'
    )
  );

alter table public.pix_cobrancas
  add column if not exists loja_itens jsonb;

alter table public.pix_cobrancas
  add column if not exists tipopagto_id integer
    references public.tipo_pagamento (tipopagto_id) on delete set null;

comment on column public.pix_cobrancas.loja_itens is
  'Itens do carrinho da Loja (JSON) para baixar estoque/receita após PIX.';

comment on column public.pix_cobrancas.tipopagto_id is
  'Tipo de pagamento escolhido na venda (Loja / outros).';
