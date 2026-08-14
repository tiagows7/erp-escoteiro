-- Movimento de estoque: origem (acerto/loja) e observação

alter table public.movimento_estoque
  add column if not exists movimentoest_origem varchar(20) not null default 'acerto';

alter table public.movimento_estoque
  add column if not exists movimentoest_obs varchar(200);

create index if not exists movimento_estoque_empresa_emissao_idx
  on public.movimento_estoque (empresa_id, movimentoest_emissao desc);

create index if not exists movimento_estoque_empresa_produto_idx
  on public.movimento_estoque (empresa_id, movimentoest_produto);

create index if not exists movimento_estoque_empresa_numero_idx
  on public.movimento_estoque (empresa_id, movimentoest_numero);

comment on column public.movimento_estoque.movimentoest_origem is
  'Origem do lançamento: acerto | loja | ...';

comment on column public.movimento_estoque.movimentoest_operacao is
  '1=Entrada, 2=Perdas, 3=Doação, 10=Venda loja (futuro)';
