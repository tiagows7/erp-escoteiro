-- Consentimento LGPD no cadastro de associados + log de auditoria

alter table public.associados
  add column if not exists lgpd_aceite_em timestamptz null,
  add column if not exists lgpd_aceite_ip text null,
  add column if not exists lgpd_aceite_por uuid null references auth.users (id) on delete set null,
  add column if not exists lgpd_aceite_versao text null,
  add column if not exists lgpd_aceite_texto text null;

comment on column public.associados.lgpd_aceite_em is
  'Data/hora do último aceite dos Termos e Política de Privacidade.';
comment on column public.associados.lgpd_aceite_ip is
  'IP registrado no aceite LGPD.';

create table if not exists public.lgpd_consentimento_log (
  id bigint generated always as identity primary key,
  empresa_id integer not null references public.empresa (id) on delete cascade,
  associado_id integer null references public.associados (associado_id) on delete set null,
  user_id uuid null references auth.users (id) on delete set null,
  aceito_em timestamptz not null default now(),
  ip text null,
  user_agent text null,
  versao_termos text not null,
  texto_consentimento text not null,
  menor_idade boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists lgpd_consentimento_log_empresa_idx
  on public.lgpd_consentimento_log (empresa_id, aceito_em desc);

create index if not exists lgpd_consentimento_log_associado_idx
  on public.lgpd_consentimento_log (associado_id, aceito_em desc);

alter table public.lgpd_consentimento_log enable row level security;

drop policy if exists "lgpd_consentimento_log_select" on public.lgpd_consentimento_log;
create policy "lgpd_consentimento_log_select"
  on public.lgpd_consentimento_log
  for select
  to authenticated
  using (public.can_access_empresa(empresa_id));

drop policy if exists "lgpd_consentimento_log_insert" on public.lgpd_consentimento_log;
create policy "lgpd_consentimento_log_insert"
  on public.lgpd_consentimento_log
  for insert
  to authenticated
  with check (public.can_access_empresa(empresa_id));
