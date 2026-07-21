-- Vincula pagamento de atividade à receita gerada (contas a receber)

alter table public.atividade_pagamento
  add column if not exists receita_id integer
    references public.receitas (receita_id) on delete set null;

create index if not exists atividade_pagamento_receita_idx
  on public.atividade_pagamento (receita_id);
