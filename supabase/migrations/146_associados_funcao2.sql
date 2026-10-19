-- Segunda função do associado (ex.: Função - 2º Função do Paxtu).

alter table public.associados
  add column if not exists funcao2 integer references public.funcao (funcao_id);

comment on column public.associados.funcao2 is
  'Segunda função do associado (importação Paxtu: Função - 2º Função).';
