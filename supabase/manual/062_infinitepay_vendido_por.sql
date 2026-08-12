-- Quem iniciou a venda InfinitePay (usuário logado que vendeu / gerou o checkout)

alter table public.infinitepay_pedidos
  add column if not exists vendido_por uuid
    references auth.users (id) on delete set null;

create index if not exists infinitepay_pedidos_vendido_por_idx
  on public.infinitepay_pedidos (vendido_por);

comment on column public.infinitepay_pedidos.vendido_por is
  'Usuário autenticado que gerou o checkout InfinitePay (venda interna). Null no link público.';
