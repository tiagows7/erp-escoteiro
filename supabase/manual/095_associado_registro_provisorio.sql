-- Situação do registro escoteiro: definitivo ou provisório.

alter table public.associados
  add column if not exists registro_provisorio boolean not null default false;

comment on column public.associados.registro_provisorio is
  'true = registro provisório; false = registro definitivo.';

create index if not exists associados_empresa_registro_provisorio_idx
  on public.associados (empresa_id, registro_provisorio)
  where registro_provisorio = true;
