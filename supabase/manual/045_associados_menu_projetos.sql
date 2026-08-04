-- =============================================================================
-- Inclui /projetos no menu dos associados (login por registro).
-- NÃO é migration — rode no SQL Editor ou via: supabase db query --linked -f ...
-- =============================================================================

-- Profiles com registro e menu_keys já definidos, sem /projetos.
update public.profiles
set menu_keys = array_append(menu_keys, '/projetos')
where registro is not null
  and btrim(registro) <> ''
  and menu_keys is not null
  and cardinality(menu_keys) > 0
  and not ('/projetos' = any (menu_keys));

-- Profiles com registro sem menu_keys: aplica o conjunto padrão do portal.
update public.profiles
set menu_keys = array[
  '/',
  '/portal-transparencia',
  '/conquistas',
  '/atividades',
  '/projetos'
]
where registro is not null
  and btrim(registro) <> ''
  and (menu_keys is null or cardinality(menu_keys) = 0);
