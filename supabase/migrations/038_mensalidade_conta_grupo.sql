-- Mensalidade é conta do grupo: não deve cair no caixa dos ramos.
-- Zera ramo/seção em títulos de mensalidade já gerados.

update public.receitas
set
  receita_ramo = null,
  receita_secao = null
where receita_origem = 'M'
  and (receita_ramo is not null or receita_secao is not null);

comment on column public.receitas.receita_ramo is
  'Ramo do título (caixa 1-4). Null = conta do grupo (caixa 0). Mensalidades ficam sempre no grupo.';
