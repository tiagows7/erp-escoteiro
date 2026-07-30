-- Data de cada conquista máxima do associado

alter table public.associados
  add column if not exists conquista_cruzeiro_do_sul_data date,
  add column if not exists conquista_lis_de_ouro_data date,
  add column if not exists conquista_escoteiro_patria_data date,
  add column if not exists conquista_insignia_bp_data date;

comment on column public.associados.conquista_cruzeiro_do_sul_data is
  'Data da conquista Cruzeiro do Sul';
comment on column public.associados.conquista_lis_de_ouro_data is
  'Data da conquista Lis de Ouro';
comment on column public.associados.conquista_escoteiro_patria_data is
  'Data da conquista Escoteiro da Pátria';
comment on column public.associados.conquista_insignia_bp_data is
  'Data da conquista Insígnia de B.P.';
