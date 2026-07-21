-- Login por e-mail ou numero de registro do usuario (profiles.registro)

alter table public.profiles
  add column if not exists registro varchar(20);

create unique index if not exists profiles_registro_uidx
  on public.profiles (registro)
  where registro is not null;

comment on column public.profiles.registro is
  'Numero de registro para login (alternativa ao e-mail).';

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
begin
  if v_login = '' then
    return null;
  end if;

  -- Ja e e-mail
  if position('@' in v_login) > 0 then
    return v_login;
  end if;

  -- Busca por numero de registro (somente digitos / texto do campo)
  select p.email
    into v_email
  from public.profiles p
  where p.ativo = true
    and p.registro is not null
    and (
      lower(p.registro) = v_login
      or regexp_replace(p.registro, '\D', '', 'g') = regexp_replace(v_login, '\D', '', 'g')
    )
  limit 1;

  return v_email;
end;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;
