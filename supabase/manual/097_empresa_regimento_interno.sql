-- Texto do regimento interno do grupo (exibido no login por registro).

alter table public.empresa
  add column if not exists regimento_interno text;

comment on column public.empresa.regimento_interno is
  'Texto do regimento interno do grupo, exibido aos associados (login por registro).';
