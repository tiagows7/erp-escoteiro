-- Vincula despesas e receitas a uma atividade do grupo

alter table public.despesas
  add column if not exists atividade_id integer
    references public.atividades (atividade_id) on delete set null;

alter table public.receitas
  add column if not exists atividade_id integer
    references public.atividades (atividade_id) on delete set null;

create index if not exists despesas_atividade_idx
  on public.despesas (atividade_id);

create index if not exists receitas_atividade_idx
  on public.receitas (atividade_id);
