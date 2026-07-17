# ERP Escoteiro (React + Supabase)

Reescrita web do ERP Delphi/D2Bridge do Grupo Escoteiro.

## Stack

- React + TypeScript + Vite
- Supabase (Postgres + Auth + RLS)

## Banco Firebird de origem

Caminho real encontrado:

`g:\sistema\BANCO\bancosclientes\BANCO_SCOUTH.FDB`

Volumes atuais: ~102 associados, 2 empresas, 5 ramos, 5565 cidades.

## Setup

1. Crie um projeto em [supabase.com](https://supabase.com)
2. No **SQL Editor**, execute:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/seed.sql` (ramos padrão)
3. Copie `.env.example` para `.env` e preencha:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

4. Instale e rode:

```bash
npm install
npm run dev
```

## Criar grupo + usuário admin

Na tela **Novo grupo escoteiro** (só `super_admin`), o formulário cria o grupo e um login `admin` desse grupo.

Para o fluxo ideal (usuário já confirmado, sem trocar sessão), publique a Edge Function:

```bash
npx supabase login
npx supabase functions deploy create-grupo --project-ref miognzsrqxktbievlggs
```

Sem a function publicada, o app usa um fallback via `signUp` (pode exigir desativar “Confirm email” em Authentication → Providers → Email).

## Multi-grupo e tipos de usuário

O sistema foi preparado para **vários grupos escoteiros** (tabela `empresa`) e **papéis diferentes** (`profiles.role`).

1. Rode também a migration:
   - `supabase/migrations/002_multitenant_roles.sql`
2. Permissões do app ficam em `src/lib/roles.ts` (fácil de ajustar depois).

### Papéis (`app_role`)

| Role | Uso |
|------|-----|
| `super_admin` | Plataforma — vê/gerencia todos os grupos |
| `admin` | Administrador do grupo |
| `tesoureiro` | Financeiro |
| `chefe` | Chefia / coordenação |
| `escotista` | Uso operacional |
| `leitura` | Somente consulta |

Cada usuário pertence a **um grupo** (`profiles.empresa_id`), exceto `super_admin` (pode ficar sem grupo).

### Criar um grupo

```sql
insert into public.empresa (nome, slug, ativo)
values ('GRUPO ESCOTEIRO EXEMPLO - 99', 'ge-exemplo-99', true)
returning id;
```

### Criar primeiro usuário

1. No Supabase Auth, crie o usuário (e-mail + senha) e copie o UUID.
2. No SQL Editor:

```sql
insert into public.empresa (id, nome, slug, ativo)
values (1, 'GRUPO ESCOTEIRO GUAJARÁ MIRIM - 18', 'ge-guajara-18', true)
on conflict (id) do nothing;

insert into public.profiles (id, empresa_id, nome, username, role, ativo)
values (
  'UUID-DO-AUTH-USER',
  1,
  'Seu Nome',
  'admin',
  'admin',   -- ou: tesoureiro | chefe | escotista | leitura | super_admin
  true
);
```

### Segundo grupo + usuário

```sql
insert into public.empresa (nome, slug, ativo)
values ('OUTRO GRUPO ESCOTEIRO', 'outro-grupo', true)
returning id; -- ex: 2

insert into public.profiles (id, empresa_id, nome, username, role, ativo)
values (
  'UUID-DO-OUTRO-USER',
  2,
  'Nome do Admin',
  'admin2',
  'admin',
  true
);
```

Os dados de associados/estoque ficam isolados por `empresa_id` (RLS).

Senhas do Firebird **não** são migradas. Cada usuário precisa de conta nova no Supabase Auth.

## Migrar dados do Firebird → Supabase

O import traz **somente referência**: `ramos`, `estado`, `cidade`, `categoria`, `funcao`.

**Não importa:** empresa, associados, seção, patrulha, produtos, estoque, despesas, usuários.  
Grupos continuam sendo criados pela tela **Novo grupo escoteiro**.

```bash
npm run import:firebird:dry   # teste
npm run import:firebird       # importa referência
npm run cleanup:operational   # limpa associados/seções/produtos já importados por engano
```

Depois rode `data/export/fix-sequences.sql` no SQL Editor.

## MVP já no app

- Login (Supabase Auth)
- Shell com menu
- Dashboard (contagem por ramo)
- Associados (lista + formulário)

## Próximos módulos

Seções, patrulhas, estoque, despesas, importação Paxtu, painel de transição.
