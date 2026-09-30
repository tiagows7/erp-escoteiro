-- O orçamento informa a atividade pelo nome, com ramo, seção e patrulha/matilha.

alter table public.orcamentos drop constraint if exists orcamentos_destino_chk;

drop index if exists public.orcamentos_atividade_uk;
drop index if exists public.orcamentos_evento_uk;

alter table public.orcamentos drop column if exists atividade_id;
alter table public.orcamentos drop column if exists evento_id;

alter table public.orcamentos
  add column if not exists nome text,
  add column if not exists ramo integer references public.ramos (ramo_id),
  add column if not exists secao integer references public.secao (secao_id),
  add column if not exists patrulha_matilha integer references public.secao_nome (secaonome_id);

update public.orcamentos
set nome = 'Orçamento'
where nome is null or btrim(nome) = '';

alter table public.orcamentos alter column nome set not null;

create index if not exists orcamentos_ramo_idx
  on public.orcamentos (empresa_id, ramo, secao);
