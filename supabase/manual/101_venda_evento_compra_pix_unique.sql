-- Evita compras duplicadas por cobrança PIX (corrida na baixa)
-- e consolida duplicatas já existentes.

-- 1) Consolidar convites na compra "keeper" e apagar compras extras
with dups as (
  select pix_cobranca_id
  from public.venda_evento_compra
  where pix_cobranca_id is not null
  group by pix_cobranca_id
  having count(*) > 1
),
keeper as (
  select distinct on (c.pix_cobranca_id)
    c.pix_cobranca_id,
    c.compra_id
  from public.venda_evento_compra c
  join dups d on d.pix_cobranca_id = c.pix_cobranca_id
  order by
    c.pix_cobranca_id,
    (
      select count(*)::integer
      from public.venda_evento_convite v
      where v.compra_id = c.compra_id
    ) desc,
    c.compra_id
)
update public.venda_evento_convite v
set compra_id = k.compra_id
from public.venda_evento_compra c
join keeper k on k.pix_cobranca_id = c.pix_cobranca_id
where v.compra_id = c.compra_id
  and c.compra_id <> k.compra_id;

with dups as (
  select pix_cobranca_id
  from public.venda_evento_compra
  where pix_cobranca_id is not null
  group by pix_cobranca_id
  having count(*) > 1
),
keeper as (
  select distinct on (c.pix_cobranca_id)
    c.pix_cobranca_id,
    c.compra_id
  from public.venda_evento_compra c
  join dups d on d.pix_cobranca_id = c.pix_cobranca_id
  order by
    c.pix_cobranca_id,
    (
      select count(*)::integer
      from public.venda_evento_convite v
      where v.compra_id = c.compra_id
    ) desc,
    c.compra_id
)
delete from public.venda_evento_compra c
using keeper k
where c.pix_cobranca_id = k.pix_cobranca_id
  and c.compra_id <> k.compra_id;

create unique index if not exists venda_evento_compra_pix_cobranca_uq
  on public.venda_evento_compra (pix_cobranca_id)
  where pix_cobranca_id is not null;

comment on index public.venda_evento_compra_pix_cobranca_uq is
  'Uma compra por cobrança PIX — evita corrida na confirmação do pagamento.';
