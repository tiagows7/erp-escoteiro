-- Permite várias contas por grupo/ramo/seção e conta sem ramo (nível grupo).
-- Remove unicidade por escopo; adiciona descrição opcional.

drop index if exists public.empresa_conta_bancaria_escopo_uidx;

alter table public.empresa_conta_bancaria
  drop constraint if exists empresa_conta_bancaria_ramo_chk;

alter table public.empresa_conta_bancaria
  alter column ramo_id drop not null;

alter table public.empresa_conta_bancaria
  add constraint empresa_conta_bancaria_ramo_chk
  check (ramo_id is null or ramo_id between 1 and 5);

alter table public.empresa_conta_bancaria
  add column if not exists descricao text;

comment on table public.empresa_conta_bancaria is
  'Contas bancárias do grupo (várias por grupo/ramo/seção) com credenciais de API.';
comment on column public.empresa_conta_bancaria.ramo_id is
  'Null = conta do grupo; preenchido = vinculada ao ramo.';
comment on column public.empresa_conta_bancaria.secao_id is
  'Null = sem seção específica; preenchido = vinculada à seção.';
comment on column public.empresa_conta_bancaria.descricao is
  'Apelido/identificação da conta (ex.: Caixa do ramo, Conta eventos).';
comment on column public.empresa_conta_bancaria.api_client_id is
  'Identificador/client_id para API do banco.';
comment on column public.empresa_conta_bancaria.api_client_secret is
  'Segredo/client_secret para API do banco.';
