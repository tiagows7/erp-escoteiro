-- Conquistas máximas do associado (insígnias)

alter table public.associados
  add column if not exists conquista_cruzeiro_do_sul boolean not null default false,
  add column if not exists conquista_lis_de_ouro boolean not null default false,
  add column if not exists conquista_escoteiro_patria boolean not null default false,
  add column if not exists conquista_insignia_bp boolean not null default false;

comment on column public.associados.conquista_cruzeiro_do_sul is
  'Conquista máxima Lobinho — Cruzeiro do Sul';
comment on column public.associados.conquista_lis_de_ouro is
  'Conquista máxima Escoteiro — Lis de Ouro';
comment on column public.associados.conquista_escoteiro_patria is
  'Conquista máxima Sênior — Escoteiro da Pátria';
comment on column public.associados.conquista_insignia_bp is
  'Conquista máxima Pioneiro — Insígnia de B.P.';

create index if not exists associados_conquista_cruzeiro_idx
  on public.associados (empresa_id)
  where conquista_cruzeiro_do_sul = true;

create index if not exists associados_conquista_lis_idx
  on public.associados (empresa_id)
  where conquista_lis_de_ouro = true;

create index if not exists associados_conquista_patria_idx
  on public.associados (empresa_id)
  where conquista_escoteiro_patria = true;

create index if not exists associados_conquista_bp_idx
  on public.associados (empresa_id)
  where conquista_insignia_bp = true;
