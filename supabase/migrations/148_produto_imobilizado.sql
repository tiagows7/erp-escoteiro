-- Produto de uso do grupo (patrimônio / imobilizado), não necessariamente para venda.

alter table public.produto
  add column if not exists imobilizado boolean not null default false;

comment on column public.produto.imobilizado is
  'Quando true, o produto é imobilizado (patrimônio / uso do grupo).';
