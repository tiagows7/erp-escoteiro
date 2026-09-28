-- Estatuto do grupo: PDF no mesmo bucket do regimento, coluna própria.

alter table public.empresa
  add column if not exists estatuto text;

comment on column public.empresa.estatuto is
  'Ref do PDF do estatuto (empresa-regimento:{empresa_id}/estatuto.pdf).';
