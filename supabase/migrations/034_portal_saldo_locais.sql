-- Locais onde está o saldo do caixa (ex.: conta do grupo, investimento, dinheiro em caixa)
-- Exibidos no Portal da Transparência abaixo dos caixas.

create table if not exists public.empresa_saldo_local (
  id bigint generated always as identity primary key,
  empresa_id integer not null references public.empresa (id) on delete cascade,
  -- 0 = caixa do grupo; 1-4 = ramos (Lobinho, Escoteiro, Sênior, Pioneiro)
  caixa_id integer not null default 0
    check (caixa_id between 0 and 4),
  secao_id integer references public.secao (secao_id) on delete cascade,
  nome text not null,
  valor numeric(15, 2) not null default 0,
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists empresa_saldo_local_empresa_idx
  on public.empresa_saldo_local (empresa_id, caixa_id, ordem);

create index if not exists empresa_saldo_local_secao_idx
  on public.empresa_saldo_local (secao_id)
  where secao_id is not null;

comment on table public.empresa_saldo_local is
  'Distribuição do saldo por local (conta, investimento, dinheiro) para o portal.';
comment on column public.empresa_saldo_local.caixa_id is
  '0 = grupo; 1-4 = ramo correspondente ao portal.';
comment on column public.empresa_saldo_local.secao_id is
  'Null = vale para o caixa inteiro; preenchido = só aquela seção.';

alter table public.empresa_saldo_local enable row level security;

drop policy if exists "empresa_saldo_local_select" on public.empresa_saldo_local;
create policy "empresa_saldo_local_select"
  on public.empresa_saldo_local
  for select
  to authenticated
  using (public.can_access_empresa(empresa_id));

drop policy if exists "empresa_saldo_local_write_admin" on public.empresa_saldo_local;
create policy "empresa_saldo_local_write_admin"
  on public.empresa_saldo_local
  for all
  to authenticated
  using (
    public.is_super_admin()
    or (
      public.is_group_admin()
      and public.can_access_empresa(empresa_id)
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.is_group_admin()
      and public.can_access_empresa(empresa_id)
    )
  );

grant select, insert, update, delete on public.empresa_saldo_local to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Leitura pública no portal (via slug)
create or replace function public.portal_saldo_locais(
  p_slug text,
  p_caixa integer default 0,
  p_secao integer default null
)
returns table (
  id bigint,
  nome text,
  valor numeric,
  ordem integer,
  secao_id integer,
  secao_nome text
)
language sql
stable
security definer
set search_path = public
as $$
  with emp as (
    select public.portal_resolve_empresa_id(p_slug) as empresa_id
  )
  select
    l.id,
    l.nome,
    l.valor,
    l.ordem,
    l.secao_id,
    s.nome as secao_nome
  from public.empresa_saldo_local l
  cross join emp
  left join public.secao s on s.secao_id = l.secao_id
  where emp.empresa_id is not null
    and l.empresa_id = emp.empresa_id
    and l.ativo = true
    and l.caixa_id = coalesce(p_caixa, 0)
    and (
      p_secao is null
      or l.secao_id is null
      or l.secao_id = p_secao
    )
  order by l.ordem, l.nome;
$$;

revoke all on function public.portal_saldo_locais(text, integer, integer) from public;
grant execute on function public.portal_saldo_locais(text, integer, integer) to anon, authenticated;
