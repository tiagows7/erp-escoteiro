-- Dados completos de PIX Sicredi na conta bancária do grupo.

alter table public.empresa_conta_bancaria
  add column if not exists api_pix_ativo boolean not null default false,
  add column if not exists api_pix_cert text,
  add column if not exists api_pix_key text,
  add column if not exists api_pix_base_url text;

comment on column public.empresa_conta_bancaria.api_pix_ativo is
  'Quando true, esta conta pode ser usada para cobranças PIX Sicredi.';
comment on column public.empresa_conta_bancaria.api_pix_chave is
  'Chave PIX da conta para cobranças/transações via API do banco.';
comment on column public.empresa_conta_bancaria.api_pix_cert is
  'Certificado mTLS (.crt/.pem) da API PIX Sicredi.';
comment on column public.empresa_conta_bancaria.api_pix_key is
  'Chave privada mTLS (.key) da API PIX Sicredi.';
comment on column public.empresa_conta_bancaria.api_pix_base_url is
  'URL base opcional da API PIX Sicredi.';
