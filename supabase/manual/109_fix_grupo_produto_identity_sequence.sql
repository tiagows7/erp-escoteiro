-- Sincroniza a identity de grupos de produto após importações com IDs explícitos.

begin;

lock table public.grupo_produto in access exclusive mode;

select setval(
  pg_get_serial_sequence(
    'public.grupo_produto',
    'grupoproduto_id'
  ),
  coalesce(
    (select max(grupoproduto_id) from public.grupo_produto),
    1
  ),
  exists (select 1 from public.grupo_produto)
);

commit;
