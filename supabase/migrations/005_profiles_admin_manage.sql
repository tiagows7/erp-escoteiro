-- Admin do grupo pode atualizar perfis do próprio grupo
-- (necessário para cadastro de Usuários)

drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_scoped" on public.profiles;

create policy "profiles_update_scoped"
  on public.profiles
  for update
  to authenticated
  using (
    id = auth.uid()
    or public.is_super_admin()
    or (
      empresa_id = public.current_empresa_id()
      and public.is_group_admin()
    )
  )
  with check (
    id = auth.uid()
    or public.is_super_admin()
    or (
      empresa_id = public.current_empresa_id()
      and public.is_group_admin()
    )
  );

-- E-mail de acesso (opcional, para exibição no cadastro de usuários)
alter table public.profiles
  add column if not exists email text;
