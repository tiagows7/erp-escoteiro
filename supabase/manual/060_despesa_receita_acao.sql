-- Vínculo de despesas e receitas com ação entre amigos

alter table public.despesas
  add column if not exists acao_id integer
    references public.acao_entre_amigos (acao_id) on delete set null;

alter table public.receitas
  add column if not exists acao_id integer
    references public.acao_entre_amigos (acao_id) on delete set null;

create index if not exists despesas_acao_idx
  on public.despesas (acao_id);

create index if not exists receitas_acao_idx
  on public.receitas (acao_id);
