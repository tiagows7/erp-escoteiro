-- Status e motivo da avaliação das sugestões (só super_admin altera).

alter table public.sugestao_melhoria
  add column if not exists situacao text not null default 'pendente'
    check (
      situacao in ('pendente', 'sera_atendida', 'feita', 'nao_sera_feita')
    ),
  add column if not exists motivo text null,
  add column if not exists avaliacao_em timestamptz null,
  add column if not exists avaliacao_por uuid null
    references auth.users (id) on delete set null;

comment on column public.sugestao_melhoria.situacao is
  'pendente | sera_atendida | feita | nao_sera_feita';
comment on column public.sugestao_melhoria.motivo is
  'Motivo informado pelo super admin ao definir a situação.';

create index if not exists sugestao_melhoria_situacao_idx
  on public.sugestao_melhoria (situacao, created_at desc);

drop policy if exists "sugestao_melhoria_update_super" on public.sugestao_melhoria;
create policy "sugestao_melhoria_update_super"
  on public.sugestao_melhoria
  for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant update on public.sugestao_melhoria to authenticated;
