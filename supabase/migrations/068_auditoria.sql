-- Auditoria ampla: log de INSERT/UPDATE/DELETE nas tabelas de negócio

create table if not exists public.auditoria_log (
  id bigint generated always as identity primary key,
  empresa_id integer null references public.empresa (id) on delete set null,
  ocorrido_em timestamptz not null default now(),
  user_id uuid null references auth.users (id) on delete set null,
  user_nome text null,
  acao text not null check (acao in ('INSERT', 'UPDATE', 'DELETE')),
  tabela text not null,
  registro_id text null,
  dados_antes jsonb null,
  dados_depois jsonb null,
  created_at timestamptz not null default now()
);

comment on table public.auditoria_log is
  'Log de auditoria (disparado por triggers nas tabelas principais).';

create index if not exists auditoria_log_empresa_em_idx
  on public.auditoria_log (empresa_id, ocorrido_em desc);

create index if not exists auditoria_log_tabela_idx
  on public.auditoria_log (empresa_id, tabela, ocorrido_em desc);

create index if not exists auditoria_log_user_idx
  on public.auditoria_log (empresa_id, user_id, ocorrido_em desc);

create index if not exists auditoria_log_registro_idx
  on public.auditoria_log (tabela, registro_id);

alter table public.auditoria_log enable row level security;

drop policy if exists "auditoria_log_select" on public.auditoria_log;
create policy "auditoria_log_select"
  on public.auditoria_log
  for select
  to authenticated
  using (
    public.is_super_admin()
    or (
      empresa_id is not null
      and public.can_access_empresa(empresa_id)
      and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('super_admin', 'admin', 'tesoureiro')
      )
    )
  );

revoke insert, update, delete on public.auditoria_log from authenticated;
grant select on public.auditoria_log to authenticated;

create or replace function public.auditoria_redact(p_data jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_key text;
  v_out jsonb := p_data;
begin
  if v_out is null then
    return null;
  end if;

  for v_key in
    select *
    from jsonb_object_keys(v_out)
  loop
    if v_key ~* '(senha|password|secret|token|hash|private_key|client_secret|access_token|refresh_token)' then
      v_out := v_out || jsonb_build_object(v_key, '[redacted]');
    end if;
  end loop;

  return v_out;
end;
$$;

create or replace function public.auditoria_only_noise_change(
  p_antes jsonb,
  p_depois jsonb
)
returns boolean
language sql
immutable
as $$
  select coalesce(
    (
      select bool_and(
        key = any (array['estoque_atual', 'updated_at', 'created_at']::text[])
      )
      from (
        select coalesce(a.key, b.key) as key
        from jsonb_each(p_antes) a
        full outer join jsonb_each(p_depois) b on a.key = b.key
        where a.value is distinct from b.value
      ) d
    ),
    true
  );
$$;

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

  if v_user is not null then
    select p.nome
    into v_nome
    from public.profiles p
    where p.id = v_user
    limit 1;
  end if;

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

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.auditoria_attach(
  p_table text,
  p_pk text,
  p_empresa_col text default 'empresa_id'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trg text := format('trg_auditoria_%s', p_table);
begin
  if to_regclass(format('public.%I', p_table)) is null then
    return;
  end if;

  execute format('drop trigger if exists %I on public.%I', v_trg, p_table);
  execute format(
    'create trigger %I
       after insert or update or delete on public.%I
       for each row
       execute function public.auditoria_row_change(%L, %L)',
    v_trg,
    p_table,
    p_pk,
    p_empresa_col
  );
end;
$$;

do $$
begin
  -- Cadastros / estrutura
  perform public.auditoria_attach('associados', 'associado_id');
  perform public.auditoria_attach('profiles', 'id');
  perform public.auditoria_attach('secao', 'secao_id');
  perform public.auditoria_attach('secao_nome', 'secaonome_id');
  perform public.auditoria_attach('tipo_pagamento', 'tipopagto_id');
  perform public.auditoria_attach('tipo_mensalidade', 'tipomensalidade_id');
  perform public.auditoria_attach('fornecedor_despesa', 'fordespesa_id');
  perform public.auditoria_attach('empresa', 'id', 'id');
  perform public.auditoria_attach('empresa_conta_bancaria', 'id');

  -- Estoque
  perform public.auditoria_attach('grupo_produto', 'grupoproduto_id');
  perform public.auditoria_attach('produto', 'produto_id');
  perform public.auditoria_attach('movimento_estoque', 'movimentoest_id');

  -- Financeiro
  perform public.auditoria_attach('receitas', 'receita_id');
  perform public.auditoria_attach('receita_pagamento', 'pagamento_id');
  perform public.auditoria_attach('despesas', 'despesa_id');
  perform public.auditoria_attach('despesa_pagamento', 'pagamento_id');

  -- Atividades / projetos / calendário
  perform public.auditoria_attach('atividades', 'atividade_id');
  perform public.auditoria_attach('atividade_pagamento', 'pagamento_id');
  perform public.auditoria_attach('atividade_confirmacao', 'confirmacao_id');
  perform public.auditoria_attach('projetos', 'projeto_id');
  perform public.auditoria_attach('calendario_grupo', 'id');

  -- Vendas
  perform public.auditoria_attach('acao_entre_amigos', 'acao_id');
  perform public.auditoria_attach('acao_entre_amigos_faixa', 'faixa_id');
  perform public.auditoria_attach('acao_entre_amigos_venda', 'venda_id');
  perform public.auditoria_attach('venda_eventos', 'evento_id');
  perform public.auditoria_attach('venda_evento_compra', 'compra_id');
  perform public.auditoria_attach('venda_evento_convite', 'convite_id');
  perform public.auditoria_attach('venda_evento_tipo', 'tipo_id');

  -- PIX / LGPD
  perform public.auditoria_attach('pix_cobrancas', 'id');
  perform public.auditoria_attach('lgpd_consentimento_log', 'id');
end;
$$;
