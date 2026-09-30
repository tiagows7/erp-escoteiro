-- A chamada de assiduidade volta a apontar para uma atividade cadastrada.
-- A mesma data pode ter mais de uma atividade.

alter table public.assiduidade
  drop constraint if exists assiduidade_ramo_data_uk;

alter table public.assiduidade
  add column if not exists atividade_id integer
  references public.atividades (atividade_id)
  on delete set null;

create unique index if not exists assiduidade_ramo_atividade_uk
  on public.assiduidade (empresa_id, ramo, atividade_id)
  where atividade_id is not null;
