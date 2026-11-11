-- Evento de venda pode liberar confirmação de participação via atividade vinculada.

alter table public.venda_eventos
  add column if not exists pedir_participacao boolean not null default false;

alter table public.venda_eventos
  add column if not exists atividade_id integer
    references public.atividades (atividade_id) on delete set null;

create index if not exists venda_eventos_atividade_idx
  on public.venda_eventos (atividade_id)
  where atividade_id is not null;

comment on column public.venda_eventos.pedir_participacao is
  'Quando true, mantém uma atividade vinculada para os jovens confirmarem participação.';

comment on column public.venda_eventos.atividade_id is
  'Atividade gerada/atualizada para confirmação de participação do evento.';
