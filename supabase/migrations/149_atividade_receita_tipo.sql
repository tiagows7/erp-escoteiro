-- Tipo de receita padrão das atividades, fixo nos parâmetros do grupo.

alter table public.empresa
  add column if not exists atividade_receita_tipo_id integer
    references public.fornecedor_despesa (fordespesa_id) on delete set null;

create index if not exists empresa_atividade_receita_tipo_idx
  on public.empresa (atividade_receita_tipo_id);

comment on column public.empresa.atividade_receita_tipo_id is
  'Tipo de receita padrão das atividades. Usado na criação e nos títulos vinculados.';

create or replace function public.empresa_valida_atividade_receita_tipo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.atividade_receita_tipo_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.fornecedor_despesa f
    where f.fordespesa_id = new.atividade_receita_tipo_id
      and f.empresa_id = new.id
      and f.fordespesa_despesa = 'R'
  ) then
    raise exception 'O tipo de receita da atividade precisa ser um contato de receita deste grupo.';
  end if;

  return new;
end;
$$;

drop trigger if exists empresa_valida_atividade_receita_tipo on public.empresa;
create trigger empresa_valida_atividade_receita_tipo
  before insert or update of atividade_receita_tipo_id
  on public.empresa
  for each row
  execute function public.empresa_valida_atividade_receita_tipo();

-- Ao gravar o parâmetro, classifica atividades e títulos ainda sem tipo.
create or replace function public.empresa_aplica_atividade_receita_tipo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.atividade_receita_tipo_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.atividade_receita_tipo_id is not distinct from old.atividade_receita_tipo_id then
    return new;
  end if;

  update public.atividades
     set receita_tipo_id = new.atividade_receita_tipo_id
   where empresa_id = new.id
     and receita_tipo_id is null;

  update public.receitas
     set receita_tipo_id = new.atividade_receita_tipo_id
   where empresa_id = new.id
     and receita_tipo_id is null
     and atividade_id is not null;

  return new;
end;
$$;

revoke all on function public.empresa_aplica_atividade_receita_tipo() from public;
revoke all on function public.empresa_aplica_atividade_receita_tipo() from anon;
revoke all on function public.empresa_aplica_atividade_receita_tipo() from authenticated;

drop trigger if exists empresa_aplica_atividade_receita_tipo on public.empresa;
create trigger empresa_aplica_atividade_receita_tipo
  after insert or update of atividade_receita_tipo_id
  on public.empresa
  for each row
  execute function public.empresa_aplica_atividade_receita_tipo();

-- Na criação da atividade, se não vier tipo, usa o parâmetro do grupo.
create or replace function public.atividade_aplica_receita_tipo_empresa()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tipo integer;
begin
  if new.receita_tipo_id is not null then
    return new;
  end if;

  select e.atividade_receita_tipo_id
    into v_tipo
  from public.empresa e
  where e.id = new.empresa_id;

  if v_tipo is null then
    raise exception 'Tipo de receita da atividade não informado nos parâmetros do grupo.';
  end if;

  new.receita_tipo_id := v_tipo;
  return new;
end;
$$;

drop trigger if exists atividade_aplica_receita_tipo_empresa on public.atividades;
create trigger atividade_aplica_receita_tipo_empresa
  before insert
  on public.atividades
  for each row
  execute function public.atividade_aplica_receita_tipo_empresa();
