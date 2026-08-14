-- Saldo atual do produto, mantido pelos movimentos de estoque

alter table public.produto
  add column if not exists estoque_atual numeric(15, 3) not null default 0;

comment on column public.produto.estoque_atual is
  'Saldo atual do produto, atualizado pelos lançamentos em movimento_estoque.';

-- Recalcula saldo a partir dos movimentos (sinal + soma / - subtrai)
create or replace function public.produto_recalc_estoque(p_produto_id integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo numeric(15, 3);
begin
  if p_produto_id is null then
    return;
  end if;

  select coalesce(
    sum(
      case
        when coalesce(movimentoest_sinal, '+') = '-'
          then -coalesce(movimentoest_quantidade, 0)
        else coalesce(movimentoest_quantidade, 0)
      end
    ),
    0
  )
  into v_saldo
  from public.movimento_estoque
  where movimentoest_produto = p_produto_id;

  update public.produto
  set estoque_atual = coalesce(v_saldo, 0)
  where produto_id = p_produto_id;
end;
$$;

create or replace function public.trg_movimento_estoque_atualiza_produto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.produto_recalc_estoque(old.movimentoest_produto);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.movimentoest_produto is distinct from new.movimentoest_produto then
      perform public.produto_recalc_estoque(old.movimentoest_produto);
    end if;
    perform public.produto_recalc_estoque(new.movimentoest_produto);
    return new;
  end if;

  -- INSERT
  perform public.produto_recalc_estoque(new.movimentoest_produto);
  return new;
end;
$$;

drop trigger if exists movimento_estoque_atualiza_produto on public.movimento_estoque;
create trigger movimento_estoque_atualiza_produto
  after insert or update or delete on public.movimento_estoque
  for each row
  execute function public.trg_movimento_estoque_atualiza_produto();

-- Backfill dos saldos atuais
do $$
declare
  r record;
begin
  for r in
    select distinct movimentoest_produto as produto_id
    from public.movimento_estoque
    where movimentoest_produto is not null
  loop
    perform public.produto_recalc_estoque(r.produto_id);
  end loop;
end;
$$;
