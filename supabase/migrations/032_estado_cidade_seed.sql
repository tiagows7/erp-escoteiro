-- Garante leitura das tabelas de UF/cidade e popula os estados brasileiros.
-- Cidades continuam podendo vir do banco ou da API IBGE (fallback no app).

grant select on table public.estado to authenticated, anon;
grant select on table public.cidade to authenticated, anon;

alter table public.estado enable row level security;
alter table public.cidade enable row level security;

drop policy if exists "estado_read_auth" on public.estado;
create policy "estado_read_auth"
  on public.estado
  for select
  to authenticated, anon
  using (true);

drop policy if exists "cidade_read_auth" on public.cidade;
create policy "cidade_read_auth"
  on public.cidade
  for select
  to authenticated, anon
  using (true);

insert into public.estado (codigo, nome) values
  ('AC', 'Acre'),
  ('AL', 'Alagoas'),
  ('AP', 'Amapá'),
  ('AM', 'Amazonas'),
  ('BA', 'Bahia'),
  ('CE', 'Ceará'),
  ('DF', 'Distrito Federal'),
  ('ES', 'Espírito Santo'),
  ('GO', 'Goiás'),
  ('MA', 'Maranhão'),
  ('MT', 'Mato Grosso'),
  ('MS', 'Mato Grosso do Sul'),
  ('MG', 'Minas Gerais'),
  ('PA', 'Pará'),
  ('PB', 'Paraíba'),
  ('PR', 'Paraná'),
  ('PE', 'Pernambuco'),
  ('PI', 'Piauí'),
  ('RJ', 'Rio de Janeiro'),
  ('RN', 'Rio Grande do Norte'),
  ('RS', 'Rio Grande do Sul'),
  ('RO', 'Rondônia'),
  ('RR', 'Roraima'),
  ('SC', 'Santa Catarina'),
  ('SP', 'São Paulo'),
  ('SE', 'Sergipe'),
  ('TO', 'Tocantins')
on conflict (codigo) do update
set nome = excluded.nome;
