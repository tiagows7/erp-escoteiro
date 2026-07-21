# Scripts manuais (NÃO entram no `supabase db push`)

| Arquivo | Uso |
|---------|-----|
| `000_reset_public.sql` | Apaga o schema `public`. Só rode no SQL Editor se quiser reset total. |
| `002b_fix_empresa_fk.sql` | Correção legada |
| `002c_fix_fornecedor_policy.sql` | Correção legada |

O reset **nunca** deve ficar em `supabase/migrations/`, senão o `db push` reaplica e apaga os dados.
