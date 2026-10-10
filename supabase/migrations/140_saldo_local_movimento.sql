-- Movimentos de cada local de saldo, um por data.
-- O saldo final encadeia as datas e atualiza o valor do local.

create table if not exists public.empresa_saldo_local_movimento (
  id bigint generated always as identity primary key,
  empresa_id integer not null references public.empresa (id) on delete cascade,
  local_id bigint not null references public.empresa_saldo_local (id) on delete cascade,
  data_movimento date not null,
  valor_aplicado numeric(15, 2) not null default 0 check (valor_aplicado >= 0),
  valor_resgatado numeric(15, 2) not null default 0 check (valor_resgatado >= 0),
  valor_creditos numeric(15, 2) not null default 0 check (valor_creditos >= 0),
  valor_debitos numeric(15, 2) not null default 0 check (valor_debitos >= 0),
  saldo_final numeric(15, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint empresa_saldo_local_movimento_data_uk unique (local_id, data_movimento)
);

create index if not exists empresa_saldo_local_movimento_local_idx
  on public.empresa_saldo_local_movimento (local_id, data_movimento);

comment on table public.empresa_saldo_local_movimento is
  'Movimento diário do local de saldo: aplicado, resgatado, créditos, débitos e saldo final.';

create or replace function public.saldo_local_recalcula_movimentos(p_local_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  saldo numeric(15, 2) := 0;
  ultima_data date;
  ultimo_saldo numeric(15, 2);
begin
  for r in
    select id, data_movimento, valor_aplicado, valor_resgatado, valor_creditos, valor_debitos
    from public.empresa_saldo_local_movimento
    where local_id = p_local_id
    order by data_movimento, id
  loop
    saldo := round(
      saldo
      + coalesce(r.valor_aplicado, 0)
      - coalesce(r.valor_resgatado, 0)
      + coalesce(r.valor_creditos, 0)
      - coalesce(r.valor_debitos, 0),
      2
    );
    update public.empresa_saldo_local_movimento
       set saldo_final = saldo
     where id = r.id
       and saldo_final is distinct from saldo;
    ultima_data := r.data_movimento;
    ultimo_saldo := saldo;
  end loop;

  if ultima_data is not null then
    update public.empresa_saldo_local
       set valor = ultimo_saldo,
           data_saldo = ultima_data,
           updated_at = now()
     where id = p_local_id;
  end if;
end;
$$;

revoke all on function public.saldo_local_recalcula_movimentos(bigint) from public;
revoke all on function public.saldo_local_recalcula_movimentos(bigint) from anon;
revoke all on function public.saldo_local_recalcula_movimentos(bigint) from authenticated;

create or replace function public.saldo_local_movimento_recalcula()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo bigint;
begin
  alvo := case when tg_op = 'DELETE' then old.local_id else new.local_id end;
  perform public.saldo_local_recalcula_movimentos(alvo);
  if tg_op = 'UPDATE' and old.local_id is distinct from new.local_id then
    perform public.saldo_local_recalcula_movimentos(old.local_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists empresa_saldo_local_movimento_recalcula
  on public.empresa_saldo_local_movimento;

create trigger empresa_saldo_local_movimento_recalcula
  after insert
     or update of data_movimento, valor_aplicado, valor_resgatado, valor_creditos, valor_debitos, local_id
     or delete
  on public.empresa_saldo_local_movimento
  for each row
  execute function public.saldo_local_movimento_recalcula();

alter table public.empresa_saldo_local_movimento enable row level security;

drop policy if exists "empresa_saldo_local_movimento_select"
  on public.empresa_saldo_local_movimento;
create policy "empresa_saldo_local_movimento_select"
  on public.empresa_saldo_local_movimento
  for select
  to authenticated
  using (public.can_access_empresa(empresa_id));

drop policy if exists "empresa_saldo_local_movimento_write_admin"
  on public.empresa_saldo_local_movimento;
create policy "empresa_saldo_local_movimento_write_admin"
  on public.empresa_saldo_local_movimento
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

grant select, insert, update, delete on public.empresa_saldo_local_movimento to authenticated;

do $$
begin
  perform public.auditoria_attach('empresa_saldo_local_movimento', 'id');
end;
$$;
