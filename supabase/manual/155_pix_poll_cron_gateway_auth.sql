-- Gateway das Edge Functions exige Authorization mesmo com verify_jwt=false.
-- A anon key (pública no frontend) fica em pix_poll_config, fora do código-fonte.
-- A autorização real do poll continua sendo o poll_ticket de uso único.

create table if not exists public.pix_poll_config (
  id integer primary key default 1 check (id = 1),
  supabase_anon_key text not null,
  updated_at timestamptz not null default now()
);

alter table public.pix_poll_config enable row level security;

revoke all on table public.pix_poll_config from public;
revoke all on table public.pix_poll_config from anon;
revoke all on table public.pix_poll_config from authenticated;
grant select, insert, update on table public.pix_poll_config to service_role;

comment on table public.pix_poll_config is
  'Config do cron PIX (anon key só para passar no gateway). Sem acesso ao app.';

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
  v_anon text;
begin
  select c.supabase_anon_key into v_anon
  from public.pix_poll_config c
  where c.id = 1;

  if v_anon is null or length(trim(v_anon)) = 0 then
    raise exception
      'pix_poll_config.supabase_anon_key ausente — configure a anon key do projeto';
  end if;

  delete from public.pix_poll_ticket
  where created_at < now() - interval '15 minutes';

  insert into public.pix_poll_ticket default values
  returning token into v_token;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon,
      'Authorization', 'Bearer ' || v_anon
    ),
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
