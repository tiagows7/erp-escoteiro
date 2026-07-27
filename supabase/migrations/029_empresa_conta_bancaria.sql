-- Contas bancárias do grupo por ramo e, opcionalmente, por seção.
-- secao_id null = conta do ramo (todas as seções).
-- api_client_id / api_client_secret: credenciais para APIs bancárias (ex.: Sicredi).

create table if not exists public.empresa_conta_bancaria (
  id bigint generated always as identity primary key,
  empresa_id integer not null references public.empresa (id) on delete cascade,
  ramo_id integer not null references public.ramos (ramo_id),
  secao_id integer references public.secao (secao_id) on delete cascade,
  banco_nome text,
  agencia text,
  conta text,
  api_client_id text,
  api_client_secret text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint empresa_conta_bancaria_ramo_chk check (ramo_id between 1 and 5)
);

-- Unique: um registro por (empresa, ramo, seção); nulls not distinct = uma conta "do ramo".
create unique index if not exists empresa_conta_bancaria_escopo_uidx
  on public.empresa_conta_bancaria (empresa_id, ramo_id, coalesce(secao_id, 0));

create index if not exists empresa_conta_bancaria_empresa_idx
  on public.empresa_conta_bancaria (empresa_id);

create index if not exists empresa_conta_bancaria_secao_idx
  on public.empresa_conta_bancaria (secao_id)
  where secao_id is not null;

comment on table public.empresa_conta_bancaria is
  'Dados bancários do grupo por ramo/seção (banco, agência, conta + credenciais API).';
comment on column public.empresa_conta_bancaria.secao_id is
  'Null = conta do ramo inteiro; preenchido = conta específica da seção.';
comment on column public.empresa_conta_bancaria.api_client_id is
  'Identificador/client_id para API do banco (ex.: Sicredi).';
comment on column public.empresa_conta_bancaria.api_client_secret is
  'Segredo/client_secret para API do banco (ex.: Sicredi).';

alter table public.empresa_conta_bancaria enable row level security;

drop policy if exists "empresa_conta_bancaria_select" on public.empresa_conta_bancaria;
create policy "empresa_conta_bancaria_select"
  on public.empresa_conta_bancaria
  for select
  to authenticated
  using (public.can_access_empresa(empresa_id));

drop policy if exists "empresa_conta_bancaria_write_super" on public.empresa_conta_bancaria;
create policy "empresa_conta_bancaria_write_super"
  on public.empresa_conta_bancaria
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant select, insert, update, delete on public.empresa_conta_bancaria to authenticated;
