-- Beneficiários não usam função: zera o campo na tabela associados.

update public.associados a
set funcao = null
where a.funcao is not null
  and exists (
    select 1
    from public.categoria c
    where c.categoria_id = a.categoria
      and upper(c.nome) like '%BENEFICI%'
  );
