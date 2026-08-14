-- Produto: flag se controla estoque

alter table public.produto
  add column if not exists controla_estoque boolean not null default true;

comment on column public.produto.controla_estoque is
  'Se true, produto entra em movimentação / acerto de estoque.';
