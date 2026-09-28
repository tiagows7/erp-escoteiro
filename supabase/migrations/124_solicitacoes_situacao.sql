-- Situação da solicitação e quem pode acompanhar (dirigente ou usuário sem ramo).

alter table public.solicitacoes
  add column if not exists situacao text;

update public.solicitacoes
set situacao = case
  when resolvida then 'realizada'
  else 'em_andamento'
end
where situacao is null;

alter table public.solicitacoes
  alter column situacao set default 'em_andamento';

alter table public.solicitacoes
  alter column situacao set not null;

alter table public.solicitacoes
  drop constraint if exists solicitacoes_situacao_chk;

alter table public.solicitacoes
  add constraint solicitacoes_situacao_chk
  check (situacao in ('em_andamento', 'realizada', 'nao_realizada'));

comment on column public.solicitacoes.situacao is
  'em_andamento, realizada ou nao_realizada.';

create or replace function public.can_gerir_solicitacoes(p_empresa_id integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_empresa(p_empresa_id)
    and (
      coalesce((
        select p.codigo_ramo
        from public.profiles p
        where p.id = auth.uid()
      ), 0) not between 1 and 5
      or exists (
        select 1
        from public.profiles p
        join public.associados a
          on a.empresa_id = p_empresa_id
         and a.registro = nullif(
           regexp_replace(coalesce(p.registro, ''), '\D', '', 'g'),
           ''
         )::integer
        left join public.categoria c on c.categoria_id = a.categoria
        left join public.funcao f on f.funcao_id = a.funcao
        where p.id = auth.uid()
          and regexp_replace(coalesce(p.registro, ''), '\D', '', 'g') <> ''
          and (
            coalesce(c.nome, '') ilike '%dirigente%'
            or coalesce(f.nome, '') ilike '%dirigente%'
            or coalesce(f.nome, '') ilike '%diretor%'
            or coalesce(f.nome, '') ilike '%direto%'
          )
      )
    );
$$;

comment on function public.can_gerir_solicitacoes(integer) is
  'Dirigente ou usuário sem ramo pode ver e mudar a situação das solicitações.';

grant execute on function public.can_gerir_solicitacoes(integer) to authenticated;

drop policy if exists solicitacoes_select on public.solicitacoes;
drop policy if exists solicitacoes_update on public.solicitacoes;
drop policy if exists solicitacoes_delete on public.solicitacoes;

create policy solicitacoes_select
  on public.solicitacoes
  for select
  to authenticated
  using (
    public.can_access_empresa(empresa_id)
    and (
      public.can_gerir_solicitacoes(empresa_id)
      or user_id = auth.uid()
    )
  );

create policy solicitacoes_update
  on public.solicitacoes
  for update
  to authenticated
  using (public.can_gerir_solicitacoes(empresa_id))
  with check (public.can_gerir_solicitacoes(empresa_id));

create policy solicitacoes_delete
  on public.solicitacoes
  for delete
  to authenticated
  using (public.can_gerir_solicitacoes(empresa_id));
