-- Configuração PIX Efí (EFI) da plataforma — conta do operador SaaS.
-- Singleton (id = 1). Só super_admin.

create table if not exists public.plataforma_efi_pix (
  id integer primary key default 1 check (id = 1),
  client_id text,
  client_secret text,
  pix_chave text,
  -- Conteúdo do certificado .p12/.pem (texto/base64), exigido pela API Pix Efí (mTLS)
  certificado text,
  certificado_senha text,
  sandbox boolean not null default false,
  ativo boolean not null default false,
  -- Opcional: sobrescreve a URL padrão (prod/homolog)
  base_url text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.plataforma_efi_pix is
  'Credenciais PIX Efí da plataforma (mensalidade dos grupos). Uma única linha (id=1).';
comment on column public.plataforma_efi_pix.certificado is
  'Certificado P12/PEM da aplicação Efí (obrigatório nas chamadas Pix, inclusive OAuth).';
comment on column public.plataforma_efi_pix.sandbox is
  'true = homologação (pix-h.api.efipay.com.br); false = produção (pix.api.efipay.com.br).';

insert into public.plataforma_efi_pix (id)
values (1)
on conflict (id) do nothing;

alter table public.plataforma_efi_pix enable row level security;

drop policy if exists "plataforma_efi_pix_super" on public.plataforma_efi_pix;
create policy "plataforma_efi_pix_super"
  on public.plataforma_efi_pix
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant select, insert, update, delete on public.plataforma_efi_pix to authenticated;

-- Leitura sem expor segredos (flags has_*)
create or replace view public.plataforma_efi_pix_safe
with (security_invoker = true)
as
select
  id,
  client_id,
  pix_chave,
  sandbox,
  ativo,
  base_url,
  updated_at,
  updated_by,
  (nullif(btrim(coalesce(client_secret, '')), '') is not null) as has_client_secret,
  (nullif(btrim(coalesce(certificado, '')), '') is not null) as has_certificado,
  (nullif(btrim(coalesce(certificado_senha, '')), '') is not null) as has_certificado_senha
from public.plataforma_efi_pix;

grant select on public.plataforma_efi_pix_safe to authenticated;

do $$
begin
  perform public.auditoria_attach('plataforma_efi_pix', 'id');
exception
  when others then null;
end;
$$;
