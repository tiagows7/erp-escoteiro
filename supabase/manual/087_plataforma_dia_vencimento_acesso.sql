-- Dia de vencimento da mensalidade da plataforma por grupo +
-- leitura das cobranças pelos usuários do próprio grupo.

alter table public.empresa
  add column if not exists plataforma_dia_vencimento smallint
    check (
      plataforma_dia_vencimento is null
      or (
        plataforma_dia_vencimento >= 1
        and plataforma_dia_vencimento <= 28
      )
    );

comment on column public.empresa.plataforma_dia_vencimento is
  'Dia do mês (1–28) do vencimento da mensalidade da plataforma. Null = último dia da competência.';

-- Usuários do grupo podem ver as próprias cobranças (aviso/bloqueio no app).
drop policy if exists "plataforma_cobranca_select_own" on public.plataforma_cobranca;
create policy "plataforma_cobranca_select_own"
  on public.plataforma_cobranca
  for select
  to authenticated
  using (
    public.is_super_admin()
    or (
      public.current_empresa_id() is not null
      and empresa_id = public.current_empresa_id()
    )
  );

-- Plano vinculado: só leitura do próprio plano (nome/valor na tela do grupo).
drop policy if exists "plataforma_plano_select_own" on public.plataforma_plano;
create policy "plataforma_plano_select_own"
  on public.plataforma_plano
  for select
  to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1
      from public.empresa e
      where e.id = public.current_empresa_id()
        and e.plataforma_plano_id = plataforma_plano.plano_id
    )
  );
