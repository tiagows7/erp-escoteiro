-- A loja usa um tipo de receita do grupo. A venda grava esse tipo na receita
-- e o portal classifica pela conta desse contato.

alter table public.empresa
  add column if not exists loja_receita_tipo_id integer
    references public.fornecedor_despesa (fordespesa_id) on delete set null;

create index if not exists empresa_loja_receita_tipo_idx
  on public.empresa (loja_receita_tipo_id);

create or replace function public.empresa_valida_loja_receita_tipo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.loja_receita_tipo_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.fornecedor_despesa f
    where f.fordespesa_id = new.loja_receita_tipo_id
      and f.empresa_id = new.id
      and f.fordespesa_despesa = 'R'
  ) then
    raise exception 'O tipo de receita da loja precisa ser um contato de receita deste grupo.';
  end if;

  return new;
end;
$$;

drop trigger if exists empresa_valida_loja_receita_tipo on public.empresa;
create trigger empresa_valida_loja_receita_tipo
  before insert or update of loja_receita_tipo_id
  on public.empresa
  for each row
  execute function public.empresa_valida_loja_receita_tipo();

create or replace function public.empresa_aplica_loja_receita_tipo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.loja_receita_tipo_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.loja_receita_tipo_id is not distinct from old.loja_receita_tipo_id then
    return new;
  end if;

  update public.receitas
     set receita_tipo_id = new.loja_receita_tipo_id
   where empresa_id = new.id
     and receita_tipo_id is null
     and receita_descricao ilike 'Venda loja%';

  return new;
end;
$$;

revoke all on function public.empresa_aplica_loja_receita_tipo() from public;
revoke all on function public.empresa_aplica_loja_receita_tipo() from anon;
revoke all on function public.empresa_aplica_loja_receita_tipo() from authenticated;

drop trigger if exists empresa_aplica_loja_receita_tipo on public.empresa;
create trigger empresa_aplica_loja_receita_tipo
  after insert or update of loja_receita_tipo_id
  on public.empresa
  for each row
  execute function public.empresa_aplica_loja_receita_tipo();

create or replace function public.receita_loja_aplica_tipo()
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
  if coalesce(new.receita_descricao, '') not ilike 'Venda loja%' then
    return new;
  end if;

  select e.loja_receita_tipo_id
    into v_tipo
  from public.empresa e
  where e.id = new.empresa_id;

  if v_tipo is null then
    raise exception 'Tipo de receita da loja não informado.';
  end if;

  new.receita_tipo_id := v_tipo;
  return new;
end;
$$;

drop trigger if exists receita_loja_aplica_tipo on public.receitas;
create trigger receita_loja_aplica_tipo
  before insert
  on public.receitas
  for each row
  execute function public.receita_loja_aplica_tipo();
