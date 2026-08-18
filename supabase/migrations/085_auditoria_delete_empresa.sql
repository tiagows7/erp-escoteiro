-- Corrige exclusão de grupo: auditoria não pode inserir empresa_id já removido.

create or replace function public.auditoria_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pk text := coalesce(nullif(TG_ARGV[0], ''), 'id');
  v_empresa_col text := coalesce(nullif(TG_ARGV[1], ''), 'empresa_id');
  v_acao text;
  v_antes jsonb;
  v_depois jsonb;
  v_empresa_id integer;
  v_registro_id text;
  v_user uuid := auth.uid();
  v_nome text;
  v_row jsonb;
begin
  if TG_TABLE_SCHEMA <> 'public' or TG_TABLE_NAME = 'auditoria_log' then
    if TG_OP = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if TG_OP = 'INSERT' then
    v_acao := 'INSERT';
    v_depois := public.auditoria_redact(to_jsonb(new));
    v_antes := null;
    v_row := to_jsonb(new);
  elsif TG_OP = 'UPDATE' then
    v_acao := 'UPDATE';
    if public.auditoria_only_noise_change(to_jsonb(old), to_jsonb(new)) then
      return new;
    end if;
    v_antes := public.auditoria_redact(to_jsonb(old));
    v_depois := public.auditoria_redact(to_jsonb(new));
    v_row := to_jsonb(new);
  elsif TG_OP = 'DELETE' then
    v_acao := 'DELETE';
    v_antes := public.auditoria_redact(to_jsonb(old));
    v_depois := null;
    v_row := to_jsonb(old);
  else
    return null;
  end if;

  v_registro_id := v_row ->> v_pk;

  if TG_TABLE_NAME = 'empresa' then
    begin
      v_empresa_id := nullif(v_row ->> 'id', '')::integer;
    exception
      when others then
        v_empresa_id := null;
    end;
  else
    begin
      v_empresa_id := nullif(v_row ->> v_empresa_col, '')::integer;
    exception
      when others then
        v_empresa_id := null;
    end;
  end if;

  -- DELETE de empresa (ou cascata): o id já não existe → não violar a FK.
  if v_empresa_id is not null
     and not exists (
       select 1 from public.empresa e where e.id = v_empresa_id
     )
  then
    v_empresa_id := null;
  end if;

  if v_user is not null then
    select p.nome
    into v_nome
    from public.profiles p
    where p.id = v_user
    limit 1;
  end if;

  begin
    insert into public.auditoria_log (
      empresa_id,
      ocorrido_em,
      user_id,
      user_nome,
      acao,
      tabela,
      registro_id,
      dados_antes,
      dados_depois
    ) values (
      v_empresa_id,
      now(),
      v_user,
      v_nome,
      v_acao,
      TG_TABLE_NAME,
      v_registro_id,
      v_antes,
      v_depois
    );
  exception
    when foreign_key_violation then
      insert into public.auditoria_log (
        empresa_id,
        ocorrido_em,
        user_id,
        user_nome,
        acao,
        tabela,
        registro_id,
        dados_antes,
        dados_depois
      ) values (
        null,
        now(),
        v_user,
        v_nome,
        v_acao,
        TG_TABLE_NAME,
        v_registro_id,
        v_antes,
        v_depois
      );
  end;

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
