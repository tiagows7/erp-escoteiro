-- Multi-grupo + tipos de usuário
-- Rode no SQL Editor do Supabase DEPOIS do 001_initial_schema.sql

-- ---------------------------------------------------------------------------
-- 1) Grupo escoteiro (empresa) — campos extras
-- ---------------------------------------------------------------------------
alter table public.empresa
  add column if not exists slug varchar(60),
  add column if not exists telefone varchar(20),
  add column if not exists logo_url text,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists empresa_slug_uidx
  on public.empresa (slug)
  where slug is not null;

-- ---------------------------------------------------------------------------
-- 2) Roles oficiais
-- ---------------------------------------------------------------------------
-- super_admin  → plataforma (vários grupos)
-- admin        → administrador do grupo
-- tesoureiro   → financeiro do grupo
-- chefe        → chefia / coordenação
-- escotista    → uso operacional do dia a dia
-- leitura      → somente consulta

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'app_role' and n.nspname = 'public'
  ) then
    create type public.app_role as enum (
      'super_admin',
      'admin',
      'tesoureiro',
      'chefe',
      'escotista',
      'leitura'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Profiles — role, status, escopo no grupo
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists role public.app_role,
  add column if not exists ativo boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

-- empresa_id pode ser nulo só para super_admin da plataforma
alter table public.profiles
  alter column empresa_id drop not null;

-- Migrar tipo legado (char) → role
update public.profiles
set role = case upper(coalesce(tipo, 'R'))
  when 'S' then 'super_admin'::public.app_role
  when 'A' then 'admin'::public.app_role
  when 'T' then 'tesoureiro'::public.app_role
  when 'C' then 'chefe'::public.app_role
  when 'E' then 'escotista'::public.app_role
  when 'L' then 'leitura'::public.app_role
  else 'admin'::public.app_role
end
where role is null;

alter table public.profiles
  alter column role set default 'escotista'::public.app_role;

alter table public.profiles
  alter column role set not null;

-- Garante empresas referenciadas por profiles (evita erro de FK)
insert into public.empresa (id, nome, slug, ativo)
select distinct
  p.empresa_id,
  coalesce('Grupo Escoteiro ' || p.empresa_id::text, 'Grupo Escoteiro'),
  'grupo-' || p.empresa_id::text,
  true
from public.profiles p
where p.empresa_id is not null
  and not exists (
    select 1 from public.empresa e where e.id = p.empresa_id
  );

-- Alinha sequence da empresa com o maior id
select setval(
  pg_get_serial_sequence('public.empresa', 'id'),
  greatest((select coalesce(max(id), 1) from public.empresa), 1)
);

-- FK empresa (se ainda não existir)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_empresa_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_empresa_id_fkey
      foreign key (empresa_id) references public.empresa (id);
  end if;
end $$;

create index if not exists profiles_empresa_id_idx on public.profiles (empresa_id);
create index if not exists profiles_role_idx on public.profiles (role);

-- ---------------------------------------------------------------------------
-- 4) Helpers de sessão
-- ---------------------------------------------------------------------------
create or replace function public.current_empresa_id()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select empresa_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'super_admin'
      and ativo = true
  );
$$;

create or replace function public.is_group_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('super_admin', 'admin')
      and ativo = true
  );
$$;

-- ---------------------------------------------------------------------------
-- 5) RLS — isolamento por grupo + exceção super_admin
-- ---------------------------------------------------------------------------

-- empresa: membro vê o próprio grupo; super_admin vê todos
drop policy if exists "empresa_select_own" on public.empresa;
create policy "empresa_select_tenant_or_super"
  on public.empresa
  for select
  to authenticated
  using (
    public.is_super_admin()
    or id = public.current_empresa_id()
  );

drop policy if exists "empresa_write_super" on public.empresa;
create policy "empresa_write_super"
  on public.empresa
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- profiles: próprio perfil; admins do grupo veem colegas; super_admin vê todos
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_scoped"
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or public.is_super_admin()
    or (
      empresa_id = public.current_empresa_id()
      and public.is_group_admin()
    )
  );

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid() or public.is_super_admin())
  with check (id = auth.uid() or public.is_super_admin());

create policy "profiles_insert_admin"
  on public.profiles
  for insert
  to authenticated
  with check (public.is_super_admin() or public.is_group_admin());

-- Helper para policies de tabelas tenant
create or replace function public.can_access_empresa(p_empresa_id integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
     or p_empresa_id = public.current_empresa_id();
$$;

-- Atualiza policies das tabelas de negócio para aceitar super_admin
do $$
declare
  t text;
begin
  foreach t in array array[
    'secao',
    'secao_nome',
    'tipo_mensalidade',
    'tipo_pagamento',
    'associados',
    'grupo_produto',
    'produto',
    'produto_custo',
    'produto_preco',
    'despesas',
    'movimento_estoque'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_tenant', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.can_access_empresa(empresa_id))
         with check (public.can_access_empresa(empresa_id))',
      t || '_tenant',
      t
    );
  end loop;
end $$;

-- fornecedor: sobrescreve a policy genérica do loop (legado podia ter empresa_id null)
drop policy if exists "fornecedor_tenant" on public.fornecedor_despesa;
drop policy if exists "fornecedor_despesa_tenant" on public.fornecedor_despesa;
create policy "fornecedor_despesa_tenant"
  on public.fornecedor_despesa
  for all
  to authenticated
  using (
    public.is_super_admin()
    or empresa_id = public.current_empresa_id()
  )
  with check (
    public.is_super_admin()
    or empresa_id = public.current_empresa_id()
  );

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_group_admin() to authenticated;
grant execute on function public.can_access_empresa(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) View conveniente para o app
-- ---------------------------------------------------------------------------
create or replace view public.me as
select
  p.id,
  p.nome,
  p.username,
  p.role,
  p.ativo,
  p.empresa_id,
  p.codigo_ramo,
  p.codigo_secao,
  p.codigo_secao_nome,
  e.nome as empresa_nome,
  e.slug as empresa_slug,
  e.ativo as empresa_ativa
from public.profiles p
left join public.empresa e on e.id = p.empresa_id
where p.id = auth.uid();

grant select on public.me to authenticated;
