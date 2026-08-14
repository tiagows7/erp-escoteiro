-- Endurecimento: profiles (anti-escalação) + segredos bancários sem SELECT no client

-- ---------------------------------------------------------------------------
-- 1) Profiles: impede auto-escalação / admin criar super_admin
-- ---------------------------------------------------------------------------

create or replace function public.profiles_guard_sensitive_cols()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_sa boolean := public.is_super_admin();
  v_is_ga boolean := public.is_group_admin();
  v_self boolean := (new.id = auth.uid());
begin
  -- INSERT
  if tg_op = 'INSERT' then
    if v_is_sa then
      return new;
    end if;

    if not v_is_ga then
      raise exception 'Sem permissão para criar usuários.';
    end if;

    if new.role = 'super_admin' then
      raise exception 'Apenas super admin pode atribuir esse papel.';
    end if;

    if new.empresa_id is distinct from public.current_empresa_id() then
      raise exception 'Usuário deve pertencer ao seu grupo.';
    end if;

    return new;
  end if;

  -- UPDATE
  if v_is_sa then
    return new;
  end if;

  -- Própria conta: não altera papel, grupo, ativo nem menu_keys
  if v_self then
    if new.role is distinct from old.role
      or new.empresa_id is distinct from old.empresa_id
      or new.ativo is distinct from old.ativo
      or new.menu_keys is distinct from old.menu_keys
      or new.tipo is distinct from old.tipo
    then
      raise exception
        'Não é permitido alterar papel, grupo, status ou menus da própria conta.';
    end if;
  end if;

  -- Admin do grupo editando colegas
  if v_is_ga then
    if old.role = 'super_admin' or new.role = 'super_admin' then
      raise exception 'Não é permitido criar ou alterar perfil de super admin.';
    end if;
    if new.empresa_id is distinct from old.empresa_id then
      raise exception 'Não é permitido mover usuário de grupo.';
    end if;
    if new.empresa_id is distinct from public.current_empresa_id() then
      raise exception 'Sem permissão neste grupo.';
    end if;
    return new;
  end if;

  -- Demais papéis: só campos não sensíveis da própria conta (já bloqueado acima)
  if not v_self then
    raise exception 'Sem permissão para alterar este perfil.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_sensitive on public.profiles;
create trigger trg_profiles_guard_sensitive
  before insert or update on public.profiles
  for each row
  execute function public.profiles_guard_sensitive_cols();

drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin"
  on public.profiles
  for insert
  to authenticated
  with check (
    public.is_super_admin()
    or (
      public.is_group_admin()
      and role <> 'super_admin'::public.app_role
      and empresa_id = public.current_empresa_id()
    )
  );

drop policy if exists "profiles_update_scoped" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

-- Self: qualquer autenticado atualiza o próprio perfil (trigger bloqueia campos sensíveis)
create policy "profiles_update_self"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Admin do grupo / super: gerencia perfis do escopo
create policy "profiles_update_admin_scoped"
  on public.profiles
  for update
  to authenticated
  using (
    public.is_super_admin()
    or (
      public.is_group_admin()
      and empresa_id = public.current_empresa_id()
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.is_group_admin()
      and empresa_id = public.current_empresa_id()
      and role <> 'super_admin'::public.app_role
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Segredos bancários: sem SELECT para authenticated (edge/service_role ok)
-- ---------------------------------------------------------------------------

revoke select (
  api_client_secret,
  api_pix_cert,
  api_pix_key
) on public.empresa_conta_bancaria from authenticated;

revoke select (
  api_client_secret,
  api_pix_cert,
  api_pix_key
) on public.empresa_conta_bancaria from anon;

-- Flags só-leitura para a UI saber se já há segredo cadastrado
alter table public.empresa_conta_bancaria
  add column if not exists has_api_client_secret boolean
    generated always as (
      nullif(btrim(coalesce(api_client_secret, '')), '') is not null
    ) stored;

alter table public.empresa_conta_bancaria
  add column if not exists has_api_pix_cert boolean
    generated always as (
      nullif(btrim(coalesce(api_pix_cert, '')), '') is not null
    ) stored;

alter table public.empresa_conta_bancaria
  add column if not exists has_api_pix_key boolean
    generated always as (
      nullif(btrim(coalesce(api_pix_key, '')), '') is not null
    ) stored;

comment on column public.empresa_conta_bancaria.has_api_client_secret is
  'Indica se há client secret cadastrado (valor secreto não é lido pelo client).';
comment on column public.empresa_conta_bancaria.has_api_pix_cert is
  'Indica se há certificado PIX cadastrado (PEM não é lido pelo client).';
comment on column public.empresa_conta_bancaria.has_api_pix_key is
  'Indica se há chave privada PIX cadastrada (PEM não é lido pelo client).';

-- Segredos legados em empresa / ramo (se existirem)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'empresa'
      and column_name = 'sicredi_pix_client_secret'
  ) then
    execute 'revoke select (sicredi_pix_client_secret, sicredi_pix_cert, sicredi_pix_key) on public.empresa from authenticated';
    execute 'revoke select (sicredi_pix_client_secret, sicredi_pix_cert, sicredi_pix_key) on public.empresa from anon';
  end if;

  if to_regclass('public.empresa_ramo_pix_sicredi') is not null then
    begin
      execute 'revoke select (sicredi_pix_client_secret, sicredi_pix_cert, sicredi_pix_key) on public.empresa_ramo_pix_sicredi from authenticated';
      execute 'revoke select (sicredi_pix_client_secret, sicredi_pix_cert, sicredi_pix_key) on public.empresa_ramo_pix_sicredi from anon';
    exception
      when undefined_column then
        null;
    end;
  end if;

  begin
    execute 'revoke select (sicredi_pix_client_secret, sicredi_pix_cert, sicredi_pix_key) on public.empresa from authenticated';
    execute 'revoke select (sicredi_pix_client_secret, sicredi_pix_cert, sicredi_pix_key) on public.empresa from anon';
  exception
    when undefined_column then
      null;
  end;
end;
$$;
