-- Controle para não reenviar o aviso de mensalidade vencida no mesmo dia.

create table if not exists public.mensalidade_lembrete_email (
  lembrete_id integer generated always as identity primary key,
  receita_id integer not null references public.receitas (receita_id) on delete cascade,
  enviado_em date not null,
  created_at timestamptz not null default now(),
  unique (receita_id, enviado_em)
);

alter table public.mensalidade_lembrete_email enable row level security;

revoke all on public.mensalidade_lembrete_email from public, anon, authenticated;
