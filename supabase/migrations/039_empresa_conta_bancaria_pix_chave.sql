-- Chave PIX por conta bancária (usada nas transações com a API do banco).

alter table public.empresa_conta_bancaria
  add column if not exists api_pix_chave text;

comment on column public.empresa_conta_bancaria.api_pix_chave is
  'Chave PIX da conta para cobranças/transações via API do banco.';
