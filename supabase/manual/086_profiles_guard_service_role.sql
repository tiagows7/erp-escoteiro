-- Edge functions usam service_role: auth.uid() é null e o trigger
-- profiles_guard_sensitive_cols bloqueava o INSERT com
-- "Sem permissão para criar usuários." (ex.: create-grupo).

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
  v_jwt_role text := coalesce(auth.jwt() ->> 'role', '');
begin
  -- Service role (edge) já valida permissão no código da function.
  if v_jwt_role = 'service_role' then
    return new;
  end if;

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
