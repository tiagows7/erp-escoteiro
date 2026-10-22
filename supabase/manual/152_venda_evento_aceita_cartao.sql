-- Evento: aceita pagamento com cartão (InfinitePay) e máximo de parcelas sem juros.

alter table public.venda_eventos
  add column if not exists aceita_cartao boolean not null default false;

alter table public.venda_eventos
  add column if not exists cartao_max_parcelas integer not null default 1;

alter table public.venda_eventos
  drop constraint if exists venda_eventos_cartao_max_parcelas_check;

alter table public.venda_eventos
  add constraint venda_eventos_cartao_max_parcelas_check
  check (cartao_max_parcelas >= 1 and cartao_max_parcelas <= 12);

comment on column public.venda_eventos.aceita_cartao is
  'Se true, o pagamento online oferece cartão via checkout InfinitePay (requer InfiniteTag na conta bancária).';

comment on column public.venda_eventos.cartao_max_parcelas is
  'Máximo de parcelas sem juros no checkout InfinitePay (1 a 12). Usado em options.assured_installments.';
