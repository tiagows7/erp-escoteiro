-- Data da atividade (para calendário do grupo)

alter table public.atividades
  add column if not exists data_atividade date;

comment on column public.atividades.data_atividade is
  'Data em que a atividade ocorre; usada no calendário do grupo.';

create index if not exists atividades_empresa_data_idx
  on public.atividades (empresa_id, data_atividade);
