-- Sugestões de melhorias do sistema (usuários com login por e-mail).

create table if not exists public.sugestao_melhoria (
  sugestao_id bigint generated always as identity primary key,
  empresa_id integer null references public.empresa (id) on delete set null,
  empresa_nome text not null,
  user_id uuid null references auth.users (id) on delete set null,
  user_nome text not null,
  user_email text null,
  titulo text not null,
  descricao text not null,
  created_at timestamptz not null default now()
);

comment on table public.sugestao_melhoria is
  'Pedidos de alteração/melhoria no ERP, enviados por usuários (login e-mail).';

create index if not exists sugestao_melhoria_created_idx
  on public.sugestao_melhoria (created_at desc);

create index if not exists sugestao_melhoria_empresa_idx
  on public.sugestao_melhoria (empresa_id, created_at desc);

alter table public.sugestao_melhoria enable row level security;

drop policy if exists "sugestao_melhoria_insert_own" on public.sugestao_melhoria;
create policy "sugestao_melhoria_insert_own"
  on public.sugestao_melhoria
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      public.is_super_admin()
      or empresa_id is null
      or empresa_id = public.current_empresa_id()
    )
  );

drop policy if exists "sugestao_melhoria_select" on public.sugestao_melhoria;
create policy "sugestao_melhoria_select"
  on public.sugestao_melhoria
  for select
  to authenticated
  using (
    public.is_super_admin()
    or user_id = auth.uid()
  );

grant select, insert on public.sugestao_melhoria to authenticated;
grant usage, select on all sequences in schema public to authenticated;

select public.auditoria_attach('sugestao_melhoria', 'sugestao_id');
