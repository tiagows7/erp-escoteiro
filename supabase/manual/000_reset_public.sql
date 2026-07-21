-- ATENÇÃO: apaga TODO o schema public do projeto.
-- Auth (login) NÃO é apagado aqui — limpe usuários em Authentication se quiser.
-- Depois rode: 001_initial_schema.sql → 002_multitenant_roles.sql → seed.sql

drop schema if exists public cascade;

create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
grant all on schema public to anon, authenticated;

alter default privileges in schema public
  grant all on tables to postgres, anon, authenticated, service_role;

alter default privileges in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;

alter default privileges in schema public
  grant all on functions to postgres, anon, authenticated, service_role;

create extension if not exists "pgcrypto" with schema extensions;
