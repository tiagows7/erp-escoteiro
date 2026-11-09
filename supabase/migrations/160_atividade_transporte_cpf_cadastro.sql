-- CPF do jovem na lista de transporte vem só do cadastro de associados.
-- Na confirmação, pedir CPF apenas para pessoas da família.

create or replace function public.atividade_confirmar_participacao(
  p_atividade_id integer,
  p_cpf text default null,
  p_acompanhantes jsonb default '[]'::jsonb
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
  v_item jsonb;
  v_nome text;
  v_acomp_cpf text;
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

  -- p_cpf permanece na assinatura por compatibilidade; o CPF do jovem
  -- na lista de transporte vem sempre de associados.cpf.

  select c.confirmacao_id into v_id
  from public.atividade_confirmacao c
  where c.atividade_id = v_atividade.atividade_id
    and c.associado_id = v_assoc.associado_id;

  if v_id is null then
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
  end if;

  if coalesce(v_atividade.tem_transporte, false) then
    if p_acompanhantes is null or jsonb_typeof(p_acompanhantes) <> 'array' then
      return query select false, 'Lista de acompanhantes inválida.'::text, v_id;
      return;
    end if;

    for v_item in
      select value from jsonb_array_elements(p_acompanhantes)
    loop
      v_nome := nullif(btrim(coalesce(v_item->>'nome', '')), '');
      v_acomp_cpf := nullif(
        regexp_replace(coalesce(v_item->>'cpf', ''), '\D', '', 'g'),
        ''
      );
      if v_nome is null and v_acomp_cpf is null then
        continue;
      end if;
      if v_nome is null then
        return query
          select false, 'Informe o nome de cada pessoa da família.'::text, v_id;
        return;
      end if;
      if v_acomp_cpf is null or char_length(v_acomp_cpf) < 11 then
        return query
          select false,
            'Informe o CPF (11 dígitos) de cada pessoa da família.'::text,
            v_id;
        return;
      end if;
    end loop;

    delete from public.atividade_acompanhante a
    where a.confirmacao_id = v_id
      and a.empresa_id = v_atividade.empresa_id;

    insert into public.atividade_acompanhante (
      empresa_id,
      confirmacao_id,
      atividade_id,
      associado_id,
      nome,
      cpf
    )
    select
      v_atividade.empresa_id,
      v_id,
      v_atividade.atividade_id,
      v_assoc.associado_id,
      btrim(v.value->>'nome'),
      left(regexp_replace(coalesce(v.value->>'cpf', ''), '\D', '', 'g'), 15)
    from jsonb_array_elements(p_acompanhantes) as v(value)
    where nullif(btrim(coalesce(v.value->>'nome', '')), '') is not null
      and nullif(
        regexp_replace(coalesce(v.value->>'cpf', ''), '\D', '', 'g'),
        ''
      ) is not null;
  end if;

  return query select true, 'Participação confirmada.'::text, v_id;
end;
$$;
