-- Função: escrita para admin do grupo / super_admin + auditoria

drop policy if exists "funcao_insert_auth" on public.funcao;
drop policy if exists "funcao_update_auth" on public.funcao;
drop policy if exists funcao_insert_authenticated on public.funcao;
drop policy if exists funcao_update_authenticated on public.funcao;
drop policy if exists funcao_write_super on public.funcao;
drop policy if exists funcao_insert_super on public.funcao;
drop policy if exists funcao_update_super on public.funcao;
drop policy if exists funcao_delete_super on public.funcao;

create policy "funcao_insert_admin"
  on public.funcao for insert to authenticated
  with check (public.is_super_admin() or public.is_group_admin());

create policy "funcao_update_admin"
  on public.funcao for update to authenticated
  using (public.is_super_admin() or public.is_group_admin())
  with check (public.is_super_admin() or public.is_group_admin());

create policy "funcao_delete_admin"
  on public.funcao for delete to authenticated
  using (public.is_super_admin() or public.is_group_admin());

select public.auditoria_attach('funcao', 'funcao_id', '_sem_empresa');
