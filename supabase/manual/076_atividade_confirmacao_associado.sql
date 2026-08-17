-- Associado (login por registro / role leitura) não passa em can_write_empresa,
-- então insert/delete em atividade_confirmacao falhava após a migration 071.

create or replace function public.atividade_associado_do_usuario()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select a.associado_id
  from public.profiles p
  join public.associados a
    on a.empresa_id = p.empresa_id
   and a.registro = nullif(regexp_replace(coalesce(p.registro, ''), '\D', '', 'g'), '')::integer
  where p.id = auth.uid()
  limit 1;
$$;

revoke all on function public.atividade_associado_do_usuario() from public;
grant execute on function public.atividade_associado_do_usuario() to authenticated;

create or replace function public.atividade_confirmar_participacao(
  p_atividade_id integer
)
returns table (
  ok boolean,
  mensagem text,
  confirmacao_id integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atividade public.atividades%rowtype;
  v_assoc public.associados%rowtype;
  v_assoc_id integer;
  v_id integer;
begin
  if auth.uid() is null then
    return query select false, 'Não autenticado.'::text, null::integer;
    return;
  end if;

  select * into v_atividade
  from public.atividades a
  where a.atividade_id = p_atividade_id;

  if not found then
    return query select false, 'Atividade não encontrada.'::text, null::integer;
    return;
  end if;

  if not public.can_access_empresa(v_atividade.empresa_id) then
    return query select false, 'Sem acesso a este grupo.'::text, null::integer;
    return;
  end if;

  v_assoc_id := public.atividade_associado_do_usuario();
  if v_assoc_id is null then
    return query
      select false, 'Associado não encontrado para o seu registro.'::text, null::integer;
    return;
  end if;

  select * into v_assoc
  from public.associados a
  where a.associado_id = v_assoc_id
    and a.empresa_id = v_atividade.empresa_id;

  if not found then
    return query select false, 'Associado inválido para esta atividade.'::text, null::integer;
    return;
  end if;

  -- Mesma regra de visibilidade do portal (ramo / seção / patrulha).
  if not (v_atividade.ramo is null and v_atividade.secao is null) then
    if v_atividade.ramo is not null
       and (v_assoc.ramo is null or v_atividade.ramo <> v_assoc.ramo) then
      return query
        select false, 'Esta atividade não está disponível para você.'::text, null::integer;
      return;
    end if;
    if v_atividade.secao is not null
       and (v_assoc.secao is null or v_atividade.secao <> v_assoc.secao) then
      return query
        select false, 'Esta atividade não está disponível para você.'::text, null::integer;
      return;
    end if;
    if v_atividade.patrulha_matilha is not null
       and (
         v_assoc.patrulha_matilha is null
         or v_atividade.patrulha_matilha <> v_assoc.patrulha_matilha
       ) then
      return query
        select false, 'Esta atividade não está disponível para você.'::text, null::integer;
      return;
    end if;
  end if;

  if exists (
    select 1
    from public.atividade_confirmacao c
    where c.atividade_id = v_atividade.atividade_id
      and c.associado_id = v_assoc.associado_id
  ) then
    select c.confirmacao_id into v_id
    from public.atividade_confirmacao c
    where c.atividade_id = v_atividade.atividade_id
      and c.associado_id = v_assoc.associado_id;
    return query select true, 'Participação já confirmada.'::text, v_id;
    return;
  end if;

  insert into public.atividade_confirmacao (
    empresa_id,
    atividade_id,
    associado_id
  ) values (
    v_atividade.empresa_id,
    v_atividade.atividade_id,
    v_assoc.associado_id
  )
  returning atividade_confirmacao.confirmacao_id into v_id;

  return query select true, 'Participação confirmada.'::text, v_id;
end;
$$;

revoke all on function public.atividade_confirmar_participacao(integer) from public;
grant execute on function public.atividade_confirmar_participacao(integer) to authenticated;

create or replace function public.atividade_cancelar_confirmacao(
  p_atividade_id integer
)
returns table (
  ok boolean,
  mensagem text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atividade public.atividades%rowtype;
  v_assoc_id integer;
  v_pag public.atividade_pagamento%rowtype;
  v_deleted integer := 0;
begin
  if auth.uid() is null then
    return query select false, 'Não autenticado.'::text;
    return;
  end if;

  select * into v_atividade
  from public.atividades a
  where a.atividade_id = p_atividade_id;

  if not found then
    return query select false, 'Atividade não encontrada.'::text;
    return;
  end if;

  if not public.can_access_empresa(v_atividade.empresa_id) then
    return query select false, 'Sem acesso a este grupo.'::text;
    return;
  end if;

  v_assoc_id := public.atividade_associado_do_usuario();
  if v_assoc_id is null then
    return query select false, 'Associado não encontrado para o seu registro.'::text;
    return;
  end if;

  -- Remove pagamento + receita vinculados (quando havia PIX / baixa).
  select * into v_pag
  from public.atividade_pagamento p
  where p.atividade_id = v_atividade.atividade_id
    and p.associado_id = v_assoc_id
    and p.empresa_id = v_atividade.empresa_id;

  if found then
    delete from public.atividade_pagamento
    where pagamento_id = v_pag.pagamento_id;

    if v_pag.receita_id is not null then
      delete from public.receitas
      where receita_id = v_pag.receita_id
        and empresa_id = v_atividade.empresa_id;
    end if;
  end if;

  delete from public.atividade_confirmacao
  where atividade_id = v_atividade.atividade_id
    and associado_id = v_assoc_id
    and empresa_id = v_atividade.empresa_id;

  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    return query select false, 'Não havia confirmação para cancelar.'::text;
    return;
  end if;

  return query select true, 'Confirmação cancelada.'::text;
end;
$$;

revoke all on function public.atividade_cancelar_confirmacao(integer) from public;
grant execute on function public.atividade_cancelar_confirmacao(integer) to authenticated;
