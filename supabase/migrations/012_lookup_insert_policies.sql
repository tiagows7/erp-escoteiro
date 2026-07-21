-- Permite que usuários autenticados criem/atualizem lookups globais
-- usados na importação Paxtu (categoria, função, ramos).

drop policy if exists "categoria_insert_auth" on public.categoria;
create policy "categoria_insert_auth"
  on public.categoria for insert to authenticated
  with check (true);

drop policy if exists "categoria_update_auth" on public.categoria;
create policy "categoria_update_auth"
  on public.categoria for update to authenticated
  using (true) with check (true);

drop policy if exists "funcao_insert_auth" on public.funcao;
create policy "funcao_insert_auth"
  on public.funcao for insert to authenticated
  with check (true);

drop policy if exists "funcao_update_auth" on public.funcao;
create policy "funcao_update_auth"
  on public.funcao for update to authenticated
  using (true) with check (true);

drop policy if exists "ramos_insert_auth" on public.ramos;
create policy "ramos_insert_auth"
  on public.ramos for insert to authenticated
  with check (true);

drop policy if exists "ramos_update_auth" on public.ramos;
create policy "ramos_update_auth"
  on public.ramos for update to authenticated
  using (true) with check (true);
