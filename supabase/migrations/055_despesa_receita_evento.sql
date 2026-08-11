-- Vínculo de despesas e receitas com eventos (venda de convites)

alter table public.despesas
  add column if not exists evento_id integer
    references public.venda_eventos (evento_id) on delete set null;

alter table public.receitas
  add column if not exists evento_id integer
    references public.venda_eventos (evento_id) on delete set null;

create index if not exists despesas_evento_idx
  on public.despesas (evento_id);

create index if not exists receitas_evento_idx
  on public.receitas (evento_id);
