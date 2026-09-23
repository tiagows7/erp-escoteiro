-- Desconto e acréscimo no recebimento de receita.
-- Valor pago (caixa) = valor baixado - desconto + acréscimo.

alter table public.receita_pagamento
  add column if not exists desconto numeric(15, 2) not null default 0,
  add column if not exists acrescimo numeric(15, 2) not null default 0;

alter table public.receita_pagamento
  drop constraint if exists receita_pagamento_valor_check;

alter table public.receita_pagamento
  add constraint receita_pagamento_valor_check
  check (valor >= 0);

alter table public.receita_pagamento
  drop constraint if exists receita_pagamento_desconto_chk;

alter table public.receita_pagamento
  add constraint receita_pagamento_desconto_chk
  check (desconto >= 0);

alter table public.receita_pagamento
  drop constraint if exists receita_pagamento_acrescimo_chk;

alter table public.receita_pagamento
  add constraint receita_pagamento_acrescimo_chk
  check (acrescimo >= 0);

comment on column public.receita_pagamento.desconto is
  'Desconto concedido neste recebimento (reduz o valor em caixa).';
comment on column public.receita_pagamento.acrescimo is
  'Acréscimo cobrado neste recebimento (aumenta o valor em caixa).';
comment on column public.receita_pagamento.valor is
  'Valor efetivamente recebido em caixa (= baixado - desconto + acréscimo).';
