-- Força bloqueio de SELECT nos segredos bancários
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
