-- Atividade, evento e ação entre amigos não gravam sem tipo de receita.
-- A receita avulsa continua podendo ficar sem tipo.

create or replace function public.cadastro_valida_tipo_receita()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name in ('atividades', 'venda_eventos', 'acao_entre_amigos')
     and new.receita_tipo_id is null then
    raise exception 'Tipo de receita não informado.';
  end if;

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
