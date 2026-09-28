-- Liga o repasse ao grupo à despesa lançada, para não gerar o título duas vezes.

alter table public.atividades
  add column if not exists repasse_despesa_id integer;

alter table public.atividades
  drop constraint if exists atividades_repasse_despesa_fk;

alter table public.atividades
  add constraint atividades_repasse_despesa_fk
  foreign key (repasse_despesa_id)
  references public.despesas (despesa_id)
  on delete set null;

alter table public.venda_eventos
  add column if not exists repasse_despesa_id integer;

alter table public.venda_eventos
  drop constraint if exists venda_eventos_repasse_despesa_fk;

alter table public.venda_eventos
  add constraint venda_eventos_repasse_despesa_fk
  foreign key (repasse_despesa_id)
  references public.despesas (despesa_id)
  on delete set null;

comment on column public.atividades.repasse_despesa_id is
  'Despesa gerada com o valor do repasse ao grupo.';
comment on column public.venda_eventos.repasse_despesa_id is
  'Despesa gerada com o valor do repasse ao grupo.';
