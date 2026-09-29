-- Liga o tipo de mensalidade a uma conta de receita e grava essa conta
-- no título no momento da geração. Títulos antigos sem conta recebem
-- a conta quando ela é escolhida no tipo; os que já têm conta permanecem.

alter table public.tipo_mensalidade
  add column if not exists plano_conta_id integer
    references public.plano_contas (plano_conta_id) on delete set null;

alter table public.receitas
  add column if not exists plano_conta_id integer
    references public.plano_contas (plano_conta_id) on delete set null;

create index if not exists tipo_mensalidade_plano_conta_idx
  on public.tipo_mensalidade (plano_conta_id);

create index if not exists receitas_plano_conta_idx
  on public.receitas (plano_conta_id);

create or replace function public.tipo_mensalidade_valida_plano_conta()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.plano_conta_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.plano_contas c
    where c.plano_conta_id = new.plano_conta_id
      and c.empresa_id = new.empresa_id
      and c.natureza = 'receita'
  ) then
    raise exception 'A conta do plano precisa ser de receita deste grupo.';
  end if;

  return new;
end;
$$;

drop trigger if exists tipo_mensalidade_valida_plano_conta
  on public.tipo_mensalidade;

create trigger tipo_mensalidade_valida_plano_conta
  before insert or update of plano_conta_id, empresa_id
  on public.tipo_mensalidade
  for each row
  execute function public.tipo_mensalidade_valida_plano_conta();

create or replace function public.tipo_mensalidade_aplica_plano_conta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.plano_conta_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.plano_conta_id is not distinct from old.plano_conta_id then
    return new;
  end if;

  update public.receitas
     set plano_conta_id = new.plano_conta_id
   where empresa_id = new.empresa_id
     and tipomensalidade_id = new.tipomensalidade_id
     and receita_origem = 'M'
     and plano_conta_id is null;

  return new;
end;
$$;

drop trigger if exists tipo_mensalidade_aplica_plano_conta
  on public.tipo_mensalidade;

create trigger tipo_mensalidade_aplica_plano_conta
  after insert or update of plano_conta_id
  on public.tipo_mensalidade
  for each row
  execute function public.tipo_mensalidade_aplica_plano_conta();

create or replace function public.receita_mensalidade_copia_plano_conta()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.receita_origem = 'M' and new.tipomensalidade_id is not null then
    select t.plano_conta_id
      into new.plano_conta_id
    from public.tipo_mensalidade t
    where t.tipomensalidade_id = new.tipomensalidade_id
      and t.empresa_id = new.empresa_id;
  end if;
  return new;
end;
$$;

drop trigger if exists receita_mensalidade_copia_plano_conta
  on public.receitas;

create trigger receita_mensalidade_copia_plano_conta
  before insert
  on public.receitas
  for each row
  execute function public.receita_mensalidade_copia_plano_conta();
