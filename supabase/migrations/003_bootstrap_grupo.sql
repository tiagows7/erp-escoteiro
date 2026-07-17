-- Grupo inicial após reset (rode depois de 001 + 002 + seed)

insert into public.empresa (id, nome, slug, ativo)
values (1, 'GRUPO ESCOTEIRO GUAJARÁ MIRIM - 18', 'ge-guajara-18', true)
on conflict (id) do update
set nome = excluded.nome,
    slug = excluded.slug,
    ativo = true;

select setval(
  pg_get_serial_sequence('public.empresa', 'id'),
  greatest((select coalesce(max(id), 1) from public.empresa), 1)
);
