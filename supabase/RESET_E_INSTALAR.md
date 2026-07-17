# Reset completo e instalação limpa

## Já feito por aqui
- Usuários do Auth apagados (incluindo `tiagows7@gmail.com`)

## No SQL Editor do Supabase (nesta ordem)

1. `migrations/000_reset_public.sql` — zera o schema `public`
2. `migrations/001_initial_schema.sql` — tabelas
3. `migrations/002_multitenant_roles.sql` — roles / multi-grupo
4. `seed.sql` — ramos
5. `migrations/003_bootstrap_grupo.sql` — grupo 1

Ignore os arquivos `002b_*` e `002c_*` (eram correções do banco antigo).

## Depois
Peça para recriar o usuário super admin (`tiagows7@gmail.com`).
