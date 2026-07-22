-- Credenciais PIX Sicredi:
-- - empresa.* → pagamento de mensalidades (caixa do grupo)
-- - empresa_ramo_pix_sicredi → pagamento de atividades (chave por ramo)

alter table public.empresa
  add column if not exists sicredi_pix_client_id text,
  add column if not exists sicredi_pix_client_secret text,
  add column if not exists sicredi_pix_chave text,
  add column if not exists sicredi_pix_cert text,
  add column if not exists sicredi_pix_key text,
  add column if not exists sicredi_pix_base_url text,
  add column if not exists sicredi_pix_ativo boolean not null default false;

comment on column public.empresa.sicredi_pix_chave is
  'Chave PIX Sicredi do grupo (mensalidades).';
comment on column public.empresa.sicredi_pix_ativo is
  'Quando true, usa as credenciais do grupo para PIX de mensalidades.';

create table if not exists public.empresa_ramo_pix_sicredi (
  id bigint generated always as identity primary key,
  empresa_id integer not null references public.empresa (id) on delete cascade,
  ramo_id integer not null references public.ramos (ramo_id),
  sicredi_pix_client_id text,
  sicredi_pix_client_secret text,
  sicredi_pix_chave text,
  sicredi_pix_cert text,
  sicredi_pix_key text,
  sicredi_pix_base_url text,
  sicredi_pix_ativo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, ramo_id)
);

create index if not exists empresa_ramo_pix_sicredi_empresa_idx
  on public.empresa_ramo_pix_sicredi (empresa_id);

alter table public.empresa_ramo_pix_sicredi enable row level security;

drop policy if exists "empresa_ramo_pix_select" on public.empresa_ramo_pix_sicredi;
create policy "empresa_ramo_pix_select"
  on public.empresa_ramo_pix_sicredi
  for select
  to authenticated
  using (public.can_access_empresa(empresa_id));

drop policy if exists "empresa_ramo_pix_write_super" on public.empresa_ramo_pix_sicredi;
create policy "empresa_ramo_pix_write_super"
  on public.empresa_ramo_pix_sicredi
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant select, insert, update, delete on public.empresa_ramo_pix_sicredi to authenticated;

-- Guarda o ramo usado na cobrança (atividades) para consultar status com a config correta.
alter table public.pix_cobrancas
  add column if not exists ramo_id integer references public.ramos (ramo_id);

comment on table public.empresa_ramo_pix_sicredi is
  'Credenciais PIX Sicredi por ramo (pagamento de atividades).';
