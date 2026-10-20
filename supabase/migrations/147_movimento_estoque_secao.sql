-- Estoque por seção no movimento: secao nula = estoque do grupo.

comment on column public.movimento_estoque.movimentoest_secao is
  'Seção do estoque. NULL = estoque do grupo escoteiro.';

create index if not exists movimento_estoque_empresa_produto_secao_idx
  on public.movimento_estoque (empresa_id, movimentoest_produto, movimentoest_secao);

-- Saldo do produto no estoque do grupo (secao null) ou de uma seção.
create or replace function public.produto_saldos_por_secao(
  p_empresa_id integer,
  p_secao_id integer default null
)
returns table (produto_id integer, saldo numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.movimentoest_produto as produto_id,
    coalesce(
      sum(
        case
          when coalesce(m.movimentoest_sinal, '+') = '-'
            then -coalesce(m.movimentoest_quantidade, 0)
          else coalesce(m.movimentoest_quantidade, 0)
        end
      ),
      0
    ) as saldo
  from public.movimento_estoque m
  where m.empresa_id = p_empresa_id
    and m.movimentoest_produto is not null
    and (
      (p_secao_id is null and m.movimentoest_secao is null)
      or (p_secao_id is not null and m.movimentoest_secao = p_secao_id)
    )
  group by m.movimentoest_produto;
$$;

revoke all on function public.produto_saldos_por_secao(integer, integer) from public;
grant execute on function public.produto_saldos_por_secao(integer, integer) to authenticated;

-- produto.estoque_atual continua sendo o total (grupo + seções).
comment on column public.produto.estoque_atual is
  'Saldo total do produto (estoque do grupo + estoques das seções).';
