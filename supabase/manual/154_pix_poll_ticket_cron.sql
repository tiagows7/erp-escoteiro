-- Poll PIX confiável sem embutir service_role/poll_secret no cron.
-- O job cria um ticket de uso único; a edge function valida e consome o ticket.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.pix_poll_ticket (
  token uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create index if not exists pix_poll_ticket_created_idx
  on public.pix_poll_ticket (created_at);

alter table public.pix_poll_ticket enable row level security;

revoke all on table public.pix_poll_ticket from public;
revoke all on table public.pix_poll_ticket from anon;
revoke all on table public.pix_poll_ticket from authenticated;
grant select, insert, delete on table public.pix_poll_ticket to service_role;

comment on table public.pix_poll_ticket is
  'Tickets de uso único para o cron disparar poll_pending na edge pix-sicredi.';

create or replace function public.pix_sicredi_enqueue_poll()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  v_token uuid;
  v_request_id bigint;
  v_url text := 'https://cxcitbgkeijzjjtryniw.supabase.co/functions/v1/pix-sicredi';
begin
  -- Limpa tickets antigos (evita acúmulo se a edge estiver fora).
  delete from public.pix_poll_ticket
  where created_at < now() - interval '15 minutes';

  insert into public.pix_poll_ticket default values
  returning token into v_token;

  select net.http_post(
    url := v_url,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'action', 'poll_pending',
      'poll_ticket', v_token
    ),
    timeout_milliseconds := 55000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.pix_sicredi_enqueue_poll() from public;
revoke all on function public.pix_sicredi_enqueue_poll() from anon;
revoke all on function public.pix_sicredi_enqueue_poll() from authenticated;
grant execute on function public.pix_sicredi_enqueue_poll() to postgres;
grant execute on function public.pix_sicredi_enqueue_poll() to service_role;

do $$
declare
  v_jobid bigint;
begin
  select j.jobid into v_jobid
  from cron.job j
  where j.jobname = 'pix-sicredi-poll-pending'
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'pix-sicredi-poll-pending',
    '* * * * *',
    $cron$select public.pix_sicredi_enqueue_poll();$cron$
  );
exception
  when undefined_table then
    raise notice 'pg_cron indisponível — poll PIX não reagendado.';
  when undefined_function then
    raise notice 'pg_cron/pg_net indisponível — poll PIX não reagendado.';
  when others then
    raise notice 'Falha ao reagendar poll PIX: %', SQLERRM;
end $$;
