-- Repasse ao grupo escoteiro em atividades e eventos.
-- percentual: % do valor recebido; por_jovem: valor × jovens.

alter table public.atividades
  add column if not exists valor_grupo numeric(15, 2) not null default 0,
  add column if not exists valor_grupo_tipo text not null default 'por_jovem',
  add column if not exists encerrado_em timestamptz,
  add column if not exists repasse_grupo numeric(15, 2),
  add column if not exists repasse_jovens integer,
  add column if not exists repasse_base numeric(15, 2);

alter table public.atividades
  drop constraint if exists atividades_valor_grupo_tipo_chk;

alter table public.atividades
  add constraint atividades_valor_grupo_tipo_chk
  check (valor_grupo_tipo in ('percentual', 'por_jovem'));

comment on column public.atividades.valor_grupo is
  'Valor do grupo: percentual (0–100) ou valor em reais por jovem.';
comment on column public.atividades.repasse_grupo is
  'Valor a repassar ao grupo, calculado ao encerrar.';

alter table public.venda_eventos
  add column if not exists valor_grupo numeric(15, 2) not null default 0,
  add column if not exists valor_grupo_tipo text not null default 'por_jovem',
  add column if not exists repasse_grupo numeric(15, 2),
  add column if not exists repasse_jovens integer,
  add column if not exists repasse_base numeric(15, 2);

alter table public.venda_eventos
  drop constraint if exists venda_eventos_valor_grupo_tipo_chk;

alter table public.venda_eventos
  add constraint venda_eventos_valor_grupo_tipo_chk
  check (valor_grupo_tipo in ('percentual', 'por_jovem'));

comment on column public.venda_eventos.valor_grupo is
  'Valor do grupo: percentual (0–100) ou valor em reais por jovem.';
comment on column public.venda_eventos.repasse_grupo is
  'Valor a repassar ao grupo, calculado ao encerrar.';
