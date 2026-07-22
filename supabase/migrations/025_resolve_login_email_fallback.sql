-- Login por registro: se profiles.email estiver vazio, usa e-mail sintetico do Auth.

create or replace function public.resolve_login_email(p_login text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_login text := lower(trim(coalesce(p_login, '')));
  v_email text;
  v_registro text;
begin
  if v_login = '' then
    return null;
  end if;

  -- Ja e e-mail
  if position('@' in v_login) > 0 then
    return v_login;
  end if;

  select
    nullif(trim(p.email), ''),
    regexp_replace(coalesce(p.registro, ''), '\D', '', 'g')
    into v_email, v_registro
  from public.profiles p
  where p.ativo = true
    and p.registro is not null
    and (
      lower(p.registro) = v_login
      or regexp_replace(p.registro, '\D', '', 'g') = regexp_replace(v_login, '\D', '', 'g')
    )
  limit 1;

  if v_email is not null and position('@' in v_email) > 0 then
    return lower(v_email);
  end if;

  -- Fallback: e-mail sintetico usado no Auth (r{registro}@usuarios.local)
  if v_registro is not null and v_registro <> '' then
    return 'r' || v_registro || '@usuarios.local';
  end if;

  return null;
end;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

-- Corrige perfis com registro sem e-mail de login.
update public.profiles
set email = 'r' || regexp_replace(registro, '\D', '', 'g') || '@usuarios.local'
where ativo = true
  and registro is not null
  and regexp_replace(registro, '\D', '', 'g') <> ''
  and (
    email is null
    or trim(email) = ''
    or position('@' in email) = 0
  );
