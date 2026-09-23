-- Provedor da API PIX na conta bancária (Sicredi | Bradesco).

alter table public.empresa_conta_bancaria
  add column if not exists api_pix_provedor text not null default 'sicredi';

alter table public.empresa_conta_bancaria
  drop constraint if exists empresa_conta_bancaria_api_pix_provedor_chk;

alter table public.empresa_conta_bancaria
  add constraint empresa_conta_bancaria_api_pix_provedor_chk
  check (api_pix_provedor in ('sicredi', 'bradesco'));

comment on column public.empresa_conta_bancaria.api_pix_provedor is
  'Provedor da API PIX desta conta: sicredi ou bradesco.';

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
  api_pix_provedor,
  infinitepay_handle,
  has_api_client_secret,
  has_api_pix_cert,
  has_api_pix_key,
  created_at,
  updated_at
) on public.empresa_conta_bancaria to authenticated;
