-- Link público + PIX Sicredi para compra de convites de eventos

alter table public.venda_eventos
  add column if not exists link_token uuid not null default gen_random_uuid();

create unique index if not exists venda_eventos_link_token_uq
  on public.venda_eventos (link_token);

alter table public.pix_cobrancas
  drop constraint if exists pix_cobrancas_tipo_check;

alter table public.pix_cobrancas
  add constraint pix_cobrancas_tipo_check
  check (
    tipo in (
      'mensalidade',
      'atividade',
      'mensalidade_lote',
      'acao_entre_amigos',
      'venda_evento'
    )
  );

alter table public.pix_cobrancas
  add column if not exists evento_id integer
    references public.venda_eventos (evento_id) on delete set null;

alter table public.pix_cobrancas
  add column if not exists nomes text[] not null default '{}';

create index if not exists pix_cobrancas_evento_idx
  on public.pix_cobrancas (evento_id)
  where evento_id is not null and baixado_em is null;

alter table public.venda_evento_compra
  drop constraint if exists venda_evento_compra_forma_pagamento_check;

alter table public.venda_evento_compra
  add constraint venda_evento_compra_forma_pagamento_check
  check (
    forma_pagamento is null
    or forma_pagamento in ('dinheiro', 'pix_direto', 'pix')
  );

alter table public.venda_evento_compra
  add column if not exists pix_cobranca_id bigint
    references public.pix_cobrancas (id) on delete set null;

create index if not exists venda_evento_compra_pix_idx
  on public.venda_evento_compra (pix_cobranca_id);

-- Info pública do evento (sem login)
create or replace function public.venda_evento_public_info(p_token uuid)
returns table (
  evento_id integer,
  evento_nome text,
  valor_convite numeric,
  numero_inicial integer,
  numero_final integer,
  data_evento date,
  imagem_url text,
  empresa_nome text,
  disponiveis integer,
  total integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento public.venda_eventos%rowtype;
  v_vendidos integer;
  v_total integer;
begin
  select * into v_evento
  from public.venda_eventos e
  where e.link_token = p_token;

  if not found then
    return;
  end if;

  v_total := v_evento.numero_final - v_evento.numero_inicial + 1;
  if v_total < 0 then
    v_total := 0;
  end if;

  select count(*)::integer into v_vendidos
  from public.venda_evento_convite c
  where c.evento_id = v_evento.evento_id;

  return query
  select
    v_evento.evento_id,
    v_evento.nome::text,
    v_evento.valor_convite,
    v_evento.numero_inicial,
    v_evento.numero_final,
    v_evento.data_evento,
    v_evento.imagem_url,
    coalesce(e.nome, '')::text,
    greatest(v_total - coalesce(v_vendidos, 0), 0),
    v_total
  from public.empresa e
  where e.id = v_evento.empresa_id;
end;
$$;

revoke all on function public.venda_evento_public_info(uuid) from public;
grant execute on function public.venda_evento_public_info(uuid)
  to anon, authenticated;
