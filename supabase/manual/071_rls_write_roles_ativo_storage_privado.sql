-- Endurecimento: ativo em can_access, RLS de escrita por papel, storage privado

-- ---------------------------------------------------------------------------
-- 1) Sessão: só usuário ativo
-- ---------------------------------------------------------------------------
create or replace function public.current_empresa_id()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select empresa_id
  from public.profiles
  where id = auth.uid()
    and ativo = true;
$$;

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and ativo = true;
$$;

create or replace function public.can_access_empresa(p_empresa_id integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
     or (
       p_empresa_id is not null
       and p_empresa_id = public.current_empresa_id()
     );
$$;

-- Qualquer papel operacional (não leitura) pode mutar dados gerais do tenant
create or replace function public.can_write_empresa(p_empresa_id integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_empresa(p_empresa_id)
     and coalesce(public.current_user_role(), 'leitura'::public.app_role)
         <> 'leitura'::public.app_role;
$$;

-- Financeiro: admin / tesoureiro / super_admin
create or replace function public.can_write_financeiro(p_empresa_id integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_empresa(p_empresa_id)
     and coalesce(public.current_user_role(), 'leitura'::public.app_role)
         in (
           'super_admin'::public.app_role,
           'admin'::public.app_role,
           'tesoureiro'::public.app_role
         );
$$;

-- Estoque: admin / chefe / super_admin
create or replace function public.can_write_estoque(p_empresa_id integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_empresa(p_empresa_id)
     and coalesce(public.current_user_role(), 'leitura'::public.app_role)
         in (
           'super_admin'::public.app_role,
           'admin'::public.app_role,
           'chefe'::public.app_role
         );
$$;

grant execute on function public.can_write_empresa(integer) to authenticated;
grant execute on function public.can_write_financeiro(integer) to authenticated;
grant execute on function public.can_write_estoque(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Troca FOR ALL → SELECT + escrita por papel
-- ---------------------------------------------------------------------------
create or replace function public.harden_tenant_write_policies(
  p_table text,
  p_write_fn text default 'can_write_empresa'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy text := p_table || '_tenant';
  v_sel text := p_table || '_select';
  v_ins text := p_table || '_insert';
  v_upd text := p_table || '_update';
  v_del text := p_table || '_delete';
begin
  if to_regclass(format('public.%I', p_table)) is null then
    return;
  end if;

  execute format('drop policy if exists %I on public.%I', v_policy, p_table);
  execute format('drop policy if exists %I on public.%I', v_sel, p_table);
  execute format('drop policy if exists %I on public.%I', v_ins, p_table);
  execute format('drop policy if exists %I on public.%I', v_upd, p_table);
  execute format('drop policy if exists %I on public.%I', v_del, p_table);
  -- nomes legados
  execute format('drop policy if exists %I on public.%I', p_table || '_tenant_select', p_table);
  execute format('drop policy if exists %I on public.%I', p_table || '_tenant_write', p_table);

  execute format(
    'create policy %I on public.%I for select to authenticated
       using (public.can_access_empresa(empresa_id))',
    v_sel, p_table
  );
  execute format(
    'create policy %I on public.%I for insert to authenticated
       with check (public.%I(empresa_id))',
    v_ins, p_table, p_write_fn
  );
  execute format(
    'create policy %I on public.%I for update to authenticated
       using (public.%I(empresa_id))
       with check (public.%I(empresa_id))',
    v_upd, p_table, p_write_fn, p_write_fn
  );
  execute format(
    'create policy %I on public.%I for delete to authenticated
       using (public.%I(empresa_id))',
    v_del, p_table, p_write_fn
  );
end;
$$;

do $$
begin
  -- Geral / cadastros (qualquer papel ≠ leitura)
  perform public.harden_tenant_write_policies('associados', 'can_write_empresa');
  perform public.harden_tenant_write_policies('secao', 'can_write_empresa');
  perform public.harden_tenant_write_policies('secao_nome', 'can_write_empresa');
  perform public.harden_tenant_write_policies('atividades', 'can_write_empresa');
  perform public.harden_tenant_write_policies('atividade_confirmacao', 'can_write_empresa');
  perform public.harden_tenant_write_policies('atividade_pagamento', 'can_write_empresa');
  perform public.harden_tenant_write_policies('projetos', 'can_write_empresa');
  perform public.harden_tenant_write_policies('calendario_grupo', 'can_write_empresa');
  perform public.harden_tenant_write_policies('acao_entre_amigos', 'can_write_empresa');
  perform public.harden_tenant_write_policies('acao_entre_amigos_faixa', 'can_write_empresa');
  perform public.harden_tenant_write_policies('acao_entre_amigos_venda', 'can_write_empresa');
  perform public.harden_tenant_write_policies('venda_eventos', 'can_write_empresa');
  perform public.harden_tenant_write_policies('venda_evento_compra', 'can_write_empresa');
  perform public.harden_tenant_write_policies('venda_evento_convite', 'can_write_empresa');
  perform public.harden_tenant_write_policies('venda_evento_tipo', 'can_write_empresa');

  -- Financeiro / estoque: bloqueia papel leitura (refino por módulo fica no app + próximas iterações)
  perform public.harden_tenant_write_policies('receitas', 'can_write_empresa');
  perform public.harden_tenant_write_policies('receita_pagamento', 'can_write_empresa');
  perform public.harden_tenant_write_policies('despesas', 'can_write_empresa');
  perform public.harden_tenant_write_policies('despesa_pagamento', 'can_write_empresa');
  perform public.harden_tenant_write_policies('tipo_pagamento', 'can_write_financeiro');
  perform public.harden_tenant_write_policies('tipo_mensalidade', 'can_write_financeiro');
  perform public.harden_tenant_write_policies('fornecedor_despesa', 'can_write_financeiro');

  perform public.harden_tenant_write_policies('grupo_produto', 'can_write_estoque');
  perform public.harden_tenant_write_policies('produto', 'can_write_estoque');
  perform public.harden_tenant_write_policies('produto_custo', 'can_write_estoque');
  perform public.harden_tenant_write_policies('produto_preco', 'can_write_estoque');
  -- Movimento: venda loja / acerto — quem pode vender também baixa estoque
  perform public.harden_tenant_write_policies('movimento_estoque', 'can_write_empresa');
end;
$$;

-- Lookup global: SELECT permanece; escrita só super_admin
do $$
begin
  if to_regclass('public.categoria') is not null then
    execute 'drop policy if exists categoria_insert_authenticated on public.categoria';
    execute 'drop policy if exists categoria_update_authenticated on public.categoria';
    execute 'drop policy if exists "categoria_insert" on public.categoria';
    execute 'drop policy if exists "categoria_update" on public.categoria';
    execute 'drop policy if exists categoria_write_super on public.categoria';
    execute 'create policy categoria_insert_super on public.categoria for insert to authenticated with check (public.is_super_admin())';
    execute 'create policy categoria_update_super on public.categoria for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin())';
    execute 'create policy categoria_delete_super on public.categoria for delete to authenticated using (public.is_super_admin())';
  end if;
  if to_regclass('public.funcao') is not null then
    execute 'drop policy if exists funcao_insert_authenticated on public.funcao';
    execute 'drop policy if exists funcao_update_authenticated on public.funcao';
    execute 'drop policy if exists funcao_write_super on public.funcao';
    execute 'create policy funcao_insert_super on public.funcao for insert to authenticated with check (public.is_super_admin())';
    execute 'create policy funcao_update_super on public.funcao for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin())';
    execute 'create policy funcao_delete_super on public.funcao for delete to authenticated using (public.is_super_admin())';
  end if;
  if to_regclass('public.ramos') is not null then
    execute 'drop policy if exists ramos_insert_authenticated on public.ramos';
    execute 'drop policy if exists ramos_update_authenticated on public.ramos';
    execute 'drop policy if exists ramos_write_super on public.ramos';
    execute 'create policy ramos_insert_super on public.ramos for insert to authenticated with check (public.is_super_admin())';
    execute 'create policy ramos_update_super on public.ramos for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin())';
    execute 'create policy ramos_delete_super on public.ramos for delete to authenticated using (public.is_super_admin())';
  end if;
exception
  when others then
    raise notice 'lookup harden skipped: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Storage: comprovantes financeiros privados
-- ---------------------------------------------------------------------------
update storage.buckets
set public = false
where id in ('receita-comprovantes', 'despesa-notas');

drop policy if exists "receita_comprovantes_public_read" on storage.objects;
drop policy if exists "despesa_notas_public_read" on storage.objects;

drop policy if exists "receita_comprovantes_tenant_select" on storage.objects;
create policy "receita_comprovantes_tenant_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'receita-comprovantes'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  );

drop policy if exists "despesa_notas_tenant_select" on storage.objects;
create policy "despesa_notas_tenant_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'despesa-notas'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  );
