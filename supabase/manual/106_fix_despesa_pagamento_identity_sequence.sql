-- Sincroniza a identity dos pagamentos de despesas após importações
-- com IDs explícitos.

begin;

lock table public.despesa_pagamento in access exclusive mode;

select setval(
  pg_get_serial_sequence(
    'public.despesa_pagamento',
    'pagamento_id'
  ),
  coalesce(
    (select max(pagamento_id) from public.despesa_pagamento),
    1
  ),
  exists (select 1 from public.despesa_pagamento)
);

commit;
