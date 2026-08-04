-- Menus liberados por usuário (NULL = usa apenas o papel).
alter table public.profiles
  add column if not exists menu_keys text[] null;

comment on column public.profiles.menu_keys is
  'Rotas de menu liberadas para o usuário. NULL = acesso padrão do papel.';
