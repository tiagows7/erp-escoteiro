-- Tag InfinitePay na conta bancária
alter table public.empresa_conta_bancaria
  add column if not exists infinitepay_handle text;

comment on column public.empresa_conta_bancaria.infinitepay_handle is
  'InfiniteTag da InfinitePay (sem $). Se vazia, usa PIX Sicredi da conta.';
