-- PIX Sicredi para venda pública da ação entre amigos

alter table public.pix_cobrancas
  drop constraint if exists pix_cobrancas_tipo_check;

alter table public.pix_cobrancas
  add constraint pix_cobrancas_tipo_check
  check (
    tipo in (
      'mensalidade',
      'atividade',
      'mensalidade_lote',
      'acao_entre_amigos'
    )
  );

alter table public.pix_cobrancas
  add column if not exists acao_id integer
    references public.acao_entre_amigos (acao_id) on delete set null;

alter table public.pix_cobrancas
  add column if not exists faixa_id integer
    references public.acao_entre_amigos_faixa (faixa_id) on delete set null;

alter table public.pix_cobrancas
  add column if not exists link_token uuid;

alter table public.pix_cobrancas
  add column if not exists numeros integer[] not null default '{}';

alter table public.pix_cobrancas
  add column if not exists comprador_nome text;

alter table public.pix_cobrancas
  add column if not exists comprador_telefone text;

create index if not exists pix_cobrancas_link_token_idx
  on public.pix_cobrancas (link_token)
  where link_token is not null and baixado_em is null;

alter table public.acao_entre_amigos_venda
  add column if not exists pix_cobranca_id bigint
    references public.pix_cobrancas (id) on delete set null;

create index if not exists acao_entre_amigos_venda_pix_idx
  on public.acao_entre_amigos_venda (pix_cobranca_id);
