-- Receita (exceto mensalidade) passa a classificar pelo tipo de receita,
-- que é um contato da tabela de fornecedores marcado como receita.
-- Mensalidade continua no plano de contas do tipo de mensalidade.

alter table public.atividades
  add column if not exists receita_tipo_id integer
    references public.fornecedor_despesa (fordespesa_id) on delete set null;

alter table public.venda_eventos
  add column if not exists receita_tipo_id integer
    references public.fornecedor_despesa (fordespesa_id) on delete set null;

alter table public.acao_entre_amigos
  add column if not exists receita_tipo_id integer
    references public.fornecedor_despesa (fordespesa_id) on delete set null;

alter table public.receitas
  add column if not exists receita_tipo_id integer
    references public.fornecedor_despesa (fordespesa_id) on delete set null;

create index if not exists atividades_receita_tipo_idx
  on public.atividades (receita_tipo_id);

create index if not exists venda_eventos_receita_tipo_idx
  on public.venda_eventos (receita_tipo_id);

create index if not exists acao_entre_amigos_receita_tipo_idx
  on public.acao_entre_amigos (receita_tipo_id);

create index if not exists receitas_receita_tipo_idx
  on public.receitas (receita_tipo_id);

create or replace function public.cadastro_valida_tipo_receita()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.receita_tipo_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.fornecedor_despesa f
    where f.fordespesa_id = new.receita_tipo_id
      and f.empresa_id = new.empresa_id
      and f.fordespesa_despesa = 'R'
  ) then
    raise exception 'O tipo de receita precisa ser um contato de receita deste grupo.';
  end if;

  return new;
end;
$$;

drop trigger if exists atividades_valida_tipo_receita on public.atividades;
create trigger atividades_valida_tipo_receita
  before insert or update of receita_tipo_id, empresa_id
  on public.atividades
  for each row
  execute function public.cadastro_valida_tipo_receita();

drop trigger if exists venda_eventos_valida_tipo_receita on public.venda_eventos;
create trigger venda_eventos_valida_tipo_receita
  before insert or update of receita_tipo_id, empresa_id
  on public.venda_eventos
  for each row
  execute function public.cadastro_valida_tipo_receita();

drop trigger if exists acao_entre_amigos_valida_tipo_receita on public.acao_entre_amigos;
create trigger acao_entre_amigos_valida_tipo_receita
  before insert or update of receita_tipo_id, empresa_id
  on public.acao_entre_amigos
  for each row
  execute function public.cadastro_valida_tipo_receita();

drop trigger if exists receitas_valida_tipo_receita on public.receitas;
create trigger receitas_valida_tipo_receita
  before insert or update of receita_tipo_id, empresa_id
  on public.receitas
  for each row
  execute function public.cadastro_valida_tipo_receita();

create or replace function public.cadastro_aplica_tipo_receita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.receita_tipo_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.receita_tipo_id is not distinct from old.receita_tipo_id then
    return new;
  end if;

  if tg_table_name = 'venda_eventos' then
    update public.receitas
       set receita_tipo_id = new.receita_tipo_id
     where empresa_id = new.empresa_id
       and evento_id = new.evento_id
       and receita_tipo_id is null
       and coalesce(receita_origem, '') <> 'M';
  elsif tg_table_name = 'atividades' then
    update public.receitas
       set receita_tipo_id = new.receita_tipo_id
     where empresa_id = new.empresa_id
       and atividade_id = new.atividade_id
       and receita_tipo_id is null
       and coalesce(receita_origem, '') <> 'M';
  elsif tg_table_name = 'acao_entre_amigos' then
    update public.receitas
       set receita_tipo_id = new.receita_tipo_id
     where empresa_id = new.empresa_id
       and acao_id = new.acao_id
       and receita_tipo_id is null
       and coalesce(receita_origem, '') <> 'M';
  end if;

  return new;
end;
$$;

revoke all on function public.cadastro_aplica_tipo_receita() from public;
revoke all on function public.cadastro_aplica_tipo_receita() from anon;
revoke all on function public.cadastro_aplica_tipo_receita() from authenticated;

drop trigger if exists venda_eventos_aplica_tipo_receita on public.venda_eventos;
create trigger venda_eventos_aplica_tipo_receita
  after insert or update of receita_tipo_id
  on public.venda_eventos
  for each row
  execute function public.cadastro_aplica_tipo_receita();

drop trigger if exists atividades_aplica_tipo_receita on public.atividades;
create trigger atividades_aplica_tipo_receita
  after insert or update of receita_tipo_id
  on public.atividades
  for each row
  execute function public.cadastro_aplica_tipo_receita();

drop trigger if exists acao_entre_amigos_aplica_tipo_receita on public.acao_entre_amigos;
create trigger acao_entre_amigos_aplica_tipo_receita
  after insert or update of receita_tipo_id
  on public.acao_entre_amigos
  for each row
  execute function public.cadastro_aplica_tipo_receita();

create or replace function public.receita_vinculo_copia_tipo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tipo integer;
begin
  if coalesce(new.receita_origem, '') = 'M' then
    return new;
  end if;
  if new.receita_tipo_id is not null then
    return new;
  end if;

  if new.atividade_id is not null then
    select a.receita_tipo_id
      into v_tipo
    from public.atividades a
    where a.atividade_id = new.atividade_id
      and a.empresa_id = new.empresa_id;
  elsif new.evento_id is not null then
    select e.receita_tipo_id
      into v_tipo
    from public.venda_eventos e
    where e.evento_id = new.evento_id
      and e.empresa_id = new.empresa_id;
  elsif new.acao_id is not null then
    select a.receita_tipo_id
      into v_tipo
    from public.acao_entre_amigos a
    where a.acao_id = new.acao_id
      and a.empresa_id = new.empresa_id;
  end if;

  if v_tipo is not null then
    new.receita_tipo_id := v_tipo;
  end if;

  return new;
end;
$$;

drop trigger if exists receita_vinculo_copia_tipo on public.receitas;
create trigger receita_vinculo_copia_tipo
  before insert
  on public.receitas
  for each row
  execute function public.receita_vinculo_copia_tipo();

drop trigger if exists venda_eventos_aplica_plano_conta on public.venda_eventos;
drop trigger if exists atividades_aplica_plano_conta on public.atividades;
drop trigger if exists acao_entre_amigos_aplica_plano_conta on public.acao_entre_amigos;
drop trigger if exists receita_vinculo_copia_plano_conta on public.receitas;

create or replace function public.portal_plano_contas(
  p_slug text,
  p_ano integer default null,
  p_caixa integer default 0,
  p_secao integer default null,
  p_mes integer default null
)
returns table (
  lado text,
  plano_conta_id integer,
  plano_codigo text,
  plano_nome text,
  fornecedor_nome text,
  qtd integer,
  total numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      case
        when p_ano is null then null::date
        when p_mes is null or p_mes < 1 or p_mes > 12 then make_date(p_ano, 1, 1)
        else make_date(p_ano, p_mes, 1)
      end as periodo_inicio,
      case
        when p_ano is null then null::date
        when p_mes is null or p_mes < 1 or p_mes > 12 then make_date(p_ano + 1, 1, 1)
        when p_mes = 12 then make_date(p_ano + 1, 1, 1)
        else make_date(p_ano, p_mes + 1, 1)
      end as periodo_fim
  ),
  receitas_base as (
    select
      case
        when r.receita_origem = 'M' then r.plano_conta_id
        when r.receita_tipo_id is not null then f.plano_conta_id
        else r.plano_conta_id
      end as plano_conta_id,
      case
        when r.receita_origem = 'M' then 'Mensalidade'
        else coalesce(f.fordespesa_nome, 'Sem tipo')
      end as tipo_nome,
      r.receita_valor,
      r.receita_saldo
    from public.receitas r
    left join public.fornecedor_despesa f
      on f.fordespesa_id = r.receita_tipo_id
    cross join bounds
    where r.empresa_id = public.portal_resolve_empresa_id(p_slug)
      and (
        coalesce(p_caixa, 0) = -1
        or public._portal_caixa_id(r.receita_ramo) = coalesce(p_caixa, 0)
      )
      and (
        p_secao is null
        or r.receita_secao = p_secao
      )
      and (
        bounds.periodo_inicio is null
        or (
          coalesce(r.receita_emissao, r.receita_competencia) >= bounds.periodo_inicio
          and coalesce(r.receita_emissao, r.receita_competencia) < bounds.periodo_fim
        )
      )
      and coalesce(r.receita_valor, 0) > coalesce(r.receita_saldo, 0)
  ),
  receitas_conta as (
    select
      'receita'::text as lado,
      c.plano_conta_id,
      c.codigo as plano_codigo,
      coalesce(c.nome, 'Sem conta') as plano_nome,
      b.tipo_nome as fornecedor_nome,
      count(*)::integer as qtd,
      coalesce(sum(b.receita_valor - b.receita_saldo), 0) as total
    from receitas_base b
    left join public.plano_contas c
      on c.plano_conta_id = b.plano_conta_id
    group by c.plano_conta_id, c.codigo, c.nome, b.tipo_nome
  ),
  despesas_conta as (
    select
      'despesa'::text as lado,
      c.plano_conta_id,
      c.codigo as plano_codigo,
      coalesce(c.nome, 'Sem conta') as plano_nome,
      coalesce(f.fordespesa_nome, 'Sem fornecedor') as fornecedor_nome,
      count(*)::integer as qtd,
      coalesce(sum(d.despesa_valor - d.despesa_saldo), 0) as total
    from public.despesas d
    left join public.fornecedor_despesa f
      on f.fordespesa_id = d.despesa_fornecedor
    left join public.plano_contas c
      on c.plano_conta_id = f.plano_conta_id
     and c.empresa_id = d.empresa_id
    cross join bounds
    where d.empresa_id = public.portal_resolve_empresa_id(p_slug)
      and (
        coalesce(p_caixa, 0) = -1
        or public._portal_caixa_id(d.despesa_ramo) = coalesce(p_caixa, 0)
      )
      and (
        p_secao is null
        or d.despesa_secao = p_secao
      )
      and (
        bounds.periodo_inicio is null
        or (
          d.despesa_emissao >= bounds.periodo_inicio
          and d.despesa_emissao < bounds.periodo_fim
        )
      )
      and coalesce(d.despesa_valor, 0) > coalesce(d.despesa_saldo, 0)
    group by c.plano_conta_id, c.codigo, c.nome, f.fordespesa_id, f.fordespesa_nome
  )
  select
    x.lado,
    x.plano_conta_id,
    x.plano_codigo,
    x.plano_nome,
    x.fornecedor_nome,
    x.qtd,
    x.total
  from (
    select * from receitas_conta
    union all
    select * from despesas_conta
  ) x
  order by
    case when x.lado = 'receita' then 0 else 1 end,
    x.plano_codigo nulls last,
    x.plano_nome,
    x.fornecedor_nome nulls last;
$$;

revoke all on function public.portal_plano_contas(text, integer, integer, integer, integer) from public;
grant execute on function public.portal_plano_contas(text, integer, integer, integer, integer) to anon, authenticated;

create or replace function public.portal_plano_titulos(
  p_slug text,
  p_ano integer default null,
  p_caixa integer default 0,
  p_secao integer default null,
  p_mes integer default null,
  p_lado text default 'receita',
  p_plano_conta_id integer default null
)
returns table (
  lancamento_id integer,
  emissao date,
  competencia date,
  descricao text,
  origem text,
  fornecedor_nome text,
  ramo_nome text,
  secao_nome text,
  valor numeric,
  saldo numeric,
  situacao integer,
  documento text
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      case
        when p_ano is null then null::date
        when p_mes is null or p_mes < 1 or p_mes > 12 then make_date(p_ano, 1, 1)
        else make_date(p_ano, p_mes, 1)
      end as periodo_inicio,
      case
        when p_ano is null then null::date
        when p_mes is null or p_mes < 1 or p_mes > 12 then make_date(p_ano + 1, 1, 1)
        when p_mes = 12 then make_date(p_ano + 1, 1, 1)
        else make_date(p_ano, p_mes + 1, 1)
      end as periodo_fim
  )
  select
    r.receita_id,
    coalesce(r.receita_emissao, r.receita_competencia),
    r.receita_competencia,
    r.receita_descricao::text,
    r.receita_origem::text,
    case
      when r.receita_origem = 'M' then 'Mensalidade'
      else f.fordespesa_nome::text
    end,
    rm.nome::text,
    s.nome::text,
    r.receita_valor,
    r.receita_saldo,
    r.receita_situacao,
    r.receita_documento
  from public.receitas r
  left join public.fornecedor_despesa f
    on f.fordespesa_id = r.receita_tipo_id
  left join public.ramos rm on rm.ramo_id = r.receita_ramo
  left join public.secao s on s.secao_id = r.receita_secao
  cross join bounds
  where p_lado = 'receita'
    and r.empresa_id = public.portal_resolve_empresa_id(p_slug)
    and (
      (
        p_plano_conta_id is null
        and (
          case
            when r.receita_origem = 'M' then r.plano_conta_id
            when r.receita_tipo_id is not null then f.plano_conta_id
            else r.plano_conta_id
          end
        ) is null
      )
      or (
        case
          when r.receita_origem = 'M' then r.plano_conta_id
          when r.receita_tipo_id is not null then f.plano_conta_id
          else r.plano_conta_id
        end
      ) = p_plano_conta_id
    )
    and (
      coalesce(p_caixa, 0) = -1
      or public._portal_caixa_id(r.receita_ramo) = coalesce(p_caixa, 0)
    )
    and (
      p_secao is null
      or r.receita_secao = p_secao
    )
    and (
      bounds.periodo_inicio is null
      or (
        coalesce(r.receita_emissao, r.receita_competencia) >= bounds.periodo_inicio
        and coalesce(r.receita_emissao, r.receita_competencia) < bounds.periodo_fim
      )
    )
    and coalesce(r.receita_valor, 0) > coalesce(r.receita_saldo, 0)

  union all

  select
    d.despesa_id,
    d.despesa_emissao,
    null::date,
    d.despesa_finalidade::text,
    null::text,
    f.fordespesa_nome::text,
    rm.nome::text,
    s.nome::text,
    d.despesa_valor,
    d.despesa_saldo,
    d.despesa_situacao,
    d.despesa_documento
  from public.despesas d
  left join public.fornecedor_despesa f
    on f.fordespesa_id = d.despesa_fornecedor
  left join public.ramos rm on rm.ramo_id = d.despesa_ramo
  left join public.secao s on s.secao_id = d.despesa_secao
  cross join bounds
  where p_lado = 'despesa'
    and d.empresa_id = public.portal_resolve_empresa_id(p_slug)
    and (
      (p_plano_conta_id is null and f.plano_conta_id is null)
      or f.plano_conta_id = p_plano_conta_id
    )
    and (
      coalesce(p_caixa, 0) = -1
      or public._portal_caixa_id(d.despesa_ramo) = coalesce(p_caixa, 0)
    )
    and (
      p_secao is null
      or d.despesa_secao = p_secao
    )
    and (
      bounds.periodo_inicio is null
      or (
        d.despesa_emissao >= bounds.periodo_inicio
        and d.despesa_emissao < bounds.periodo_fim
      )
    )
    and coalesce(d.despesa_valor, 0) > coalesce(d.despesa_saldo, 0)

  order by 2 desc nulls last, 1 desc;
$$;

revoke all on function public.portal_plano_titulos(text, integer, integer, integer, integer, text, integer) from public;
grant execute on function public.portal_plano_titulos(text, integer, integer, integer, integer, text, integer) to anon, authenticated;
