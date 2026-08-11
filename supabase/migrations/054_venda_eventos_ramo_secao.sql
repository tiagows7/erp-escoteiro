-- Ramo / seção / patrulha-matilha no evento (PIX do ramo quando informado)

alter table public.venda_eventos
  add column if not exists ramo integer;

alter table public.venda_eventos
  add column if not exists secao integer;

alter table public.venda_eventos
  add column if not exists patrulha_matilha integer;

comment on column public.venda_eventos.ramo is
  'Ramo do evento; usado para escolher a conta PIX Sicredi no link público';
comment on column public.venda_eventos.secao is
  'Seção do evento (opcional)';
comment on column public.venda_eventos.patrulha_matilha is
  'Patrulha/matilha/clã do evento (opcional)';
