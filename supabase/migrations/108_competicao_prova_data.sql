-- Data em que cada prova da competição foi executada

alter table public.competicao_prova
  add column if not exists data_execucao date;

comment on column public.competicao_prova.data_execucao is
  'Data em que a prova foi realizada.';
