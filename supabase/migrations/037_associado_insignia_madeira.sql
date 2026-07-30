-- Insígnia da Madeira (conquista + data)

alter table public.associados
  add column if not exists conquista_insignia_madeira boolean not null default false,
  add column if not exists conquista_insignia_madeira_data date;

comment on column public.associados.conquista_insignia_madeira is
  'Conquista — Insígnia da Madeira';
comment on column public.associados.conquista_insignia_madeira_data is
  'Data da conquista Insígnia da Madeira';

create index if not exists associados_conquista_madeira_idx
  on public.associados (empresa_id)
  where conquista_insignia_madeira = true;
