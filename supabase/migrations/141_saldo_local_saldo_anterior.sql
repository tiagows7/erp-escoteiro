-- Saldo anterior entra no cálculo de cada movimento.
-- Saldo final = saldo anterior + aplicado - resgatado + créditos - débitos.

alter table public.empresa_saldo_local_movimento
  add column if not exists saldo_anterior numeric(15, 2) not null default 0;

comment on column public.empresa_saldo_local_movimento.saldo_anterior is
  'Saldo antes deste lançamento. Entra no saldo final da data.';

with ordenado as (
  select
    id,
    coalesce(
      lag(saldo_final) over (
        partition by local_id
        order by data_movimento, id
      ),
      0
    ) as anterior
  from public.empresa_saldo_local_movimento
)
update public.empresa_saldo_local_movimento m
   set saldo_anterior = ordenado.anterior
  from ordenado
 where m.id = ordenado.id;

create or replace function public.saldo_local_recalcula_movimentos(p_local_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  saldo numeric(15, 2);
  ultima_data date;
  ultimo_saldo numeric(15, 2);
begin
  for r in
    select
      id,
      data_movimento,
      saldo_anterior,
      valor_aplicado,
      valor_resgatado,
      valor_creditos,
      valor_debitos
    from public.empresa_saldo_local_movimento
    where local_id = p_local_id
    order by data_movimento, id
  loop
    saldo := round(
      coalesce(r.saldo_anterior, 0)
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

drop trigger if exists empresa_saldo_local_movimento_recalcula
  on public.empresa_saldo_local_movimento;

create trigger empresa_saldo_local_movimento_recalcula
  after insert
     or update of data_movimento, saldo_anterior, valor_aplicado, valor_resgatado, valor_creditos, valor_debitos, local_id
     or delete
  on public.empresa_saldo_local_movimento
  for each row
  execute function public.saldo_local_movimento_recalcula();
