-- PIX Efí das cobranças de mensalidade da plataforma.

create table if not exists public.plataforma_pix_cobrancas (
  id bigint generated always as identity primary key,
  cobranca_id integer not null
    references public.plataforma_cobranca (cobranca_id) on delete cascade,
  empresa_id integer not null references public.empresa (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  valor numeric(15, 2) not null check (valor > 0),
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
  constraint plataforma_pix_cobrancas_txid_uq unique (txid)
);

create index if not exists plataforma_pix_cobrancas_cobranca_idx
  on public.plataforma_pix_cobrancas (cobranca_id, created_at desc);

create index if not exists plataforma_pix_cobrancas_status_idx
  on public.plataforma_pix_cobrancas (status)
  where baixado_em is null;

comment on table public.plataforma_pix_cobrancas is
  'Cobranças PIX Efí vinculadas à mensalidade da plataforma.';

alter table public.plataforma_pix_cobrancas enable row level security;

drop policy if exists "plataforma_pix_cobrancas_super_select"
  on public.plataforma_pix_cobrancas;
create policy "plataforma_pix_cobrancas_super_select"
  on public.plataforma_pix_cobrancas
  for select
  to authenticated
  using (public.is_super_admin());

-- Escritas via service role (edge function)
grant select on public.plataforma_pix_cobrancas to authenticated;
grant all on public.plataforma_pix_cobrancas to service_role;
grant usage, select on all sequences in schema public to service_role;

do $$
begin
  perform public.auditoria_attach('plataforma_pix_cobrancas', 'id');
exception
  when others then null;
end;
$$;
