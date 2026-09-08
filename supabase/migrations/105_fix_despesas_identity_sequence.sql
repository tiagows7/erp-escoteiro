-- Sincroniza a identity de despesas após importações com IDs explícitos.
-- Sem isso, o próximo insert pode reutilizar um despesa_id existente.

begin;

lock table public.despesas in access exclusive mode;

select setval(
  pg_get_serial_sequence('public.despesas', 'despesa_id'),
  coalesce((select max(despesa_id) from public.despesas), 1),
  exists (select 1 from public.despesas)
);

commit;
