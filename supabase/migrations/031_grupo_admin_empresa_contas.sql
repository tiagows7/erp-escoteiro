-- Script completo e idempotente:
-- 1) Cria empresa_conta_bancaria (se não existir)
-- 2) Permite várias contas / ramo opcional / descrição
-- 3) Admin do grupo edita o próprio grupo + contas + logos

-- ---------------------------------------------------------------------------
-- Tabela de contas bancárias
-- ---------------------------------------------------------------------------
create table if not exists public.empresa_conta_bancaria (
  id bigint generated always as identity primary key,
  empresa_id integer not null references public.empresa (id) on delete cascade,
  ramo_id integer references public.ramos (ramo_id),
  secao_id integer references public.secao (secao_id) on delete cascade,
  descricao text,
  banco_nome text,
  agencia text,
  conta text,
  api_client_id text,
  api_client_secret text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Se a tabela já existia com schema antigo, alinha para o modelo atual
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

create index if not exists empresa_conta_bancaria_empresa_idx
  on public.empresa_conta_bancaria (empresa_id);

create index if not exists empresa_conta_bancaria_secao_idx
  on public.empresa_conta_bancaria (secao_id)
  where secao_id is not null;

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

alter table public.empresa_conta_bancaria enable row level security;

drop policy if exists "empresa_conta_bancaria_select" on public.empresa_conta_bancaria;
create policy "empresa_conta_bancaria_select"
  on public.empresa_conta_bancaria
  for select
  to authenticated
  using (public.can_access_empresa(empresa_id));

drop policy if exists "empresa_conta_bancaria_write_super" on public.empresa_conta_bancaria;
drop policy if exists "empresa_conta_bancaria_write_admin" on public.empresa_conta_bancaria;
create policy "empresa_conta_bancaria_write_admin"
  on public.empresa_conta_bancaria
  for all
  to authenticated
  using (
    public.is_super_admin()
    or (
      public.is_group_admin()
      and public.can_access_empresa(empresa_id)
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.is_group_admin()
      and public.can_access_empresa(empresa_id)
    )
  );

grant select, insert, update, delete on public.empresa_conta_bancaria to authenticated;

-- ---------------------------------------------------------------------------
-- empresa: admin atualiza o próprio grupo; criar/excluir só super_admin
-- ---------------------------------------------------------------------------
drop policy if exists "empresa_write_super" on public.empresa;

drop policy if exists "empresa_insert_super" on public.empresa;
create policy "empresa_insert_super"
  on public.empresa
  for insert
  to authenticated
  with check (public.is_super_admin());

drop policy if exists "empresa_update_admin_or_super" on public.empresa;
create policy "empresa_update_admin_or_super"
  on public.empresa
  for update
  to authenticated
  using (
    public.is_super_admin()
    or (
      public.is_group_admin()
      and id = public.current_empresa_id()
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.is_group_admin()
      and id = public.current_empresa_id()
    )
  );

drop policy if exists "empresa_delete_super" on public.empresa;
create policy "empresa_delete_super"
  on public.empresa
  for delete
  to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Logos: admin grava só na pasta do próprio empresa_id
-- ---------------------------------------------------------------------------
drop policy if exists "grupo_logos_super_admin_insert" on storage.objects;
drop policy if exists "grupo_logos_admin_insert" on storage.objects;
create policy "grupo_logos_admin_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'grupo-logos'
    and (
      public.is_super_admin()
      or (
        public.is_group_admin()
        and (storage.foldername(name))[1] = public.current_empresa_id()::text
      )
    )
  );

drop policy if exists "grupo_logos_super_admin_update" on storage.objects;
drop policy if exists "grupo_logos_admin_update" on storage.objects;
create policy "grupo_logos_admin_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'grupo-logos'
    and (
      public.is_super_admin()
      or (
        public.is_group_admin()
        and (storage.foldername(name))[1] = public.current_empresa_id()::text
      )
    )
  )
  with check (
    bucket_id = 'grupo-logos'
    and (
      public.is_super_admin()
      or (
        public.is_group_admin()
        and (storage.foldername(name))[1] = public.current_empresa_id()::text
      )
    )
  );

drop policy if exists "grupo_logos_super_admin_delete" on storage.objects;
drop policy if exists "grupo_logos_admin_delete" on storage.objects;
create policy "grupo_logos_admin_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'grupo-logos'
    and (
      public.is_super_admin()
      or (
        public.is_group_admin()
        and (storage.foldername(name))[1] = public.current_empresa_id()::text
      )
    )
  );
