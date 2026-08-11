-- Tag InfinitePay (Checkout Integrado) na conta bancária do grupo.
-- Se preenchida, eventos/checkouts podem usar InfinitePay;
-- se vazia, continua valendo o PIX Sicredi da mesma conta.

alter table public.empresa_conta_bancaria
  add column if not exists infinitepay_handle text;

comment on column public.empresa_conta_bancaria.infinitepay_handle is
  'InfiniteTag da InfinitePay (sem $). Se vazia, usa PIX Sicredi da conta.';
