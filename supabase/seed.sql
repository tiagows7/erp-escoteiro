-- Dados de referência padrão (sem dados sensíveis de usuários)
-- Após migrar do Firebird, estes inserts podem ser ignorados se os IDs já existirem.

insert into public.ramos (ramo_id, nome, idade_inicio, idade_fim) values
  (1, 'LOBINHO', 6, 10),
  (2, 'ESCOTEIRO', 11, 14),
  (3, 'SÊNIOR', 15, 17),
  (4, 'PIONEIRO', 18, 21),
  (5, 'DIRETORIA', null, null)
on conflict (ramo_id) do nothing;

select setval(pg_get_serial_sequence('public.ramos', 'ramo_id'), (select coalesce(max(ramo_id), 1) from public.ramos));
