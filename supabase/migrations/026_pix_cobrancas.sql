-- Cobranças PIX (Sicredi) aguardando confirmação antes da baixa financeira.

create table if not exists public.pix_cobrancas (
  id bigint generated always as identity primary key,
  empresa_id integer not null references public.empresa (id) on delete cascade,
  associado_id integer references public.associados (associado_id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  tipo text not null check (tipo in ('mensalidade', 'atividade', 'mensalidade_lote')),
  receita_ids integer[] not null default '{}',
  atividade_id integer references public.atividades (atividade_id) on delete set null,
  valor numeric(12, 2) not null check (valor > 0),
  txid varchar(35) not null,
  status varchar(40) not null default 'CRIADA',
  pix_copia_e_cola text,
  location text,
  descricao text,
  paid_at timestamptz,
  baixado_em timestamptz,
  last_error text,
  raw_create jsonb,
  raw_status jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (txid)
);

create index if not exists pix_cobrancas_empresa_idx
  on public.pix_cobrancas (empresa_id, created_at desc);

create index if not exists pix_cobrancas_status_idx
  on public.pix_cobrancas (status)
  where baixado_em is null;

alter table public.pix_cobrancas enable row level security;

drop policy if exists "pix_cobrancas_tenant_select" on public.pix_cobrancas;
create policy "pix_cobrancas_tenant_select"
  on public.pix_cobrancas
  for select
  to authenticated
  using (public.can_access_empresa(empresa_id));

-- Inserts/updates feitos pela Edge Function (service role).
grant select on public.pix_cobrancas to authenticated;

comment on table public.pix_cobrancas is
  'Cobranças PIX Sicredi; baixa financeira só após status CONCLUIDA.';
