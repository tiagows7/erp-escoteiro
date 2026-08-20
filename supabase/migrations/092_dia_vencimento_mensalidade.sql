-- Dia de vencimento das mensalidades dos associados (por grupo).

alter table public.empresa
  add column if not exists dia_vencimento_mensalidade smallint
    check (
      dia_vencimento_mensalidade is null
      or (
        dia_vencimento_mensalidade >= 1
        and dia_vencimento_mensalidade <= 28
      )
    );

comment on column public.empresa.dia_vencimento_mensalidade is
  'Dia do mês (1–28) do vencimento das mensalidades dos associados. Null = último dia da competência.';
