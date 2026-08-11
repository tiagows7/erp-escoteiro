-- Forma de pagamento na venda interna (dinheiro / PIX direto)
-- e PIX Sicredi no link público.

alter table public.acao_entre_amigos_venda
  add column if not exists forma_pagamento text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'acao_entre_amigos_venda_forma_pagamento_chk'
  ) then
    alter table public.acao_entre_amigos_venda
      add constraint acao_entre_amigos_venda_forma_pagamento_chk
      check (
        forma_pagamento is null
        or forma_pagamento in ('dinheiro', 'pix_direto', 'pix')
      );
  end if;
end $$;

comment on column public.acao_entre_amigos_venda.forma_pagamento is
  'dinheiro | pix_direto (venda no app) | pix (Sicredi no link público)';
