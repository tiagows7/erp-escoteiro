-- Plano de contas de receita em evento, atividade e ação entre amigos.
-- A conta é copiada para a receita na inclusão e aplicada nos títulos
-- antigos que ainda não tinham conta.

alter table public.venda_eventos
  add column if not exists plano_conta_id integer
    references public.plano_contas (plano_conta_id) on delete set null;

alter table public.atividades
  add column if not exists plano_conta_id integer
    references public.plano_contas (plano_conta_id) on delete set null;

alter table public.acao_entre_amigos
  add column if not exists plano_conta_id integer
    references public.plano_contas (plano_conta_id) on delete set null;

create index if not exists venda_eventos_plano_conta_idx
  on public.venda_eventos (plano_conta_id);

create index if not exists atividades_plano_conta_idx
  on public.atividades (plano_conta_id);

create index if not exists acao_entre_amigos_plano_conta_idx
  on public.acao_entre_amigos (plano_conta_id);

create or replace function public.cadastro_valida_plano_conta_receita()
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

drop trigger if exists venda_eventos_valida_plano_conta on public.venda_eventos;
create trigger venda_eventos_valida_plano_conta
  before insert or update of plano_conta_id, empresa_id
  on public.venda_eventos
  for each row
  execute function public.cadastro_valida_plano_conta_receita();

drop trigger if exists atividades_valida_plano_conta on public.atividades;
create trigger atividades_valida_plano_conta
  before insert or update of plano_conta_id, empresa_id
  on public.atividades
  for each row
  execute function public.cadastro_valida_plano_conta_receita();

drop trigger if exists acao_entre_amigos_valida_plano_conta on public.acao_entre_amigos;
create trigger acao_entre_amigos_valida_plano_conta
  before insert or update of plano_conta_id, empresa_id
  on public.acao_entre_amigos
  for each row
  execute function public.cadastro_valida_plano_conta_receita();

create or replace function public.cadastro_aplica_plano_conta_receita()
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

  if tg_table_name = 'venda_eventos' then
    update public.receitas
       set plano_conta_id = new.plano_conta_id
     where empresa_id = new.empresa_id
       and evento_id = new.evento_id
       and plano_conta_id is null;
  elsif tg_table_name = 'atividades' then
    update public.receitas
       set plano_conta_id = new.plano_conta_id
     where empresa_id = new.empresa_id
       and atividade_id = new.atividade_id
       and plano_conta_id is null;
  elsif tg_table_name = 'acao_entre_amigos' then
    update public.receitas
       set plano_conta_id = new.plano_conta_id
     where empresa_id = new.empresa_id
       and acao_id = new.acao_id
       and plano_conta_id is null;
  end if;

  return new;
end;
$$;

revoke all on function public.cadastro_aplica_plano_conta_receita() from public;
revoke all on function public.cadastro_aplica_plano_conta_receita() from anon;
revoke all on function public.cadastro_aplica_plano_conta_receita() from authenticated;

drop trigger if exists venda_eventos_aplica_plano_conta on public.venda_eventos;
create trigger venda_eventos_aplica_plano_conta
  after insert or update of plano_conta_id
  on public.venda_eventos
  for each row
  execute function public.cadastro_aplica_plano_conta_receita();

drop trigger if exists atividades_aplica_plano_conta on public.atividades;
create trigger atividades_aplica_plano_conta
  after insert or update of plano_conta_id
  on public.atividades
  for each row
  execute function public.cadastro_aplica_plano_conta_receita();

drop trigger if exists acao_entre_amigos_aplica_plano_conta on public.acao_entre_amigos;
create trigger acao_entre_amigos_aplica_plano_conta
  after insert or update of plano_conta_id
  on public.acao_entre_amigos
  for each row
  execute function public.cadastro_aplica_plano_conta_receita();

create or replace function public.receita_vinculo_copia_plano_conta()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_conta integer;
begin
  if new.plano_conta_id is not null then
    return new;
  end if;

  if new.atividade_id is not null then
    select a.plano_conta_id
      into v_conta
    from public.atividades a
    where a.atividade_id = new.atividade_id
      and a.empresa_id = new.empresa_id;
  elsif new.evento_id is not null then
    select e.plano_conta_id
      into v_conta
    from public.venda_eventos e
    where e.evento_id = new.evento_id
      and e.empresa_id = new.empresa_id;
  elsif new.acao_id is not null then
    select a.plano_conta_id
      into v_conta
    from public.acao_entre_amigos a
    where a.acao_id = new.acao_id
      and a.empresa_id = new.empresa_id;
  end if;

  if v_conta is not null then
    new.plano_conta_id := v_conta;
  end if;

  return new;
end;
$$;

drop trigger if exists receita_vinculo_copia_plano_conta on public.receitas;
create trigger receita_vinculo_copia_plano_conta
  before insert
  on public.receitas
  for each row
  execute function public.receita_vinculo_copia_plano_conta();
