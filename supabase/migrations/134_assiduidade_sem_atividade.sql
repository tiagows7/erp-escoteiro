-- Assiduidade fica só com a data da atividade, sem vínculo ao cadastro.

delete from public.assiduidade a
using public.assiduidade b
where a.empresa_id = b.empresa_id
  and a.ramo = b.ramo
  and a.data_atividade = b.data_atividade
  and a.assiduidade_id < b.assiduidade_id;

alter table public.assiduidade
  drop constraint if exists assiduidade_ramo_atividade_uk;

alter table public.assiduidade
  drop column if exists atividade_id;

alter table public.assiduidade
  add constraint assiduidade_ramo_data_uk unique (empresa_id, ramo, data_atividade);
