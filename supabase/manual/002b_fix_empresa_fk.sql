-- Correção do erro profiles_empresa_id_fkey
-- Rode ESTE script no SQL Editor e depois rode de novo o 002_multitenant_roles.sql

-- 1) Cria a empresa que o perfil já referencia
insert into public.empresa (id, nome, ativo)
values (1, 'GRUPO ESCOTEIRO GUAJARÁ MIRIM - 18', true)
on conflict (id) do update
set nome = excluded.nome,
    ativo = true;

-- 2) Qualquer outro empresa_id órfão
insert into public.empresa (id, nome, ativo)
select distinct
  p.empresa_id,
  'Grupo Escoteiro ' || p.empresa_id::text,
  true
from public.profiles p
where p.empresa_id is not null
  and not exists (select 1 from public.empresa e where e.id = p.empresa_id);

-- 3) Ajusta a sequence
select setval(
  pg_get_serial_sequence('public.empresa', 'id'),
  greatest((select coalesce(max(id), 1) from public.empresa), 1)
);
