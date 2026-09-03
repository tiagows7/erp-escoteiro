-- Poll automático de cobranças PIX Sicredi (a cada minuto).
-- Quando o banco marca CONCLUIDA, a edge function baixa e gera os convites
-- sem o usuário precisar voltar à tela do app.
--
-- O job em produção deve enviar headers apikey + Authorization (anon key).
-- Se o job já existir, não sobrescreve (evita perder a autenticação).

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  v_url text := 'https://cxcitbgkeijzjjtryniw.supabase.co/functions/v1/pix-sicredi';
begin
  if exists (
    select 1 from cron.job j where j.jobname = 'pix-sicredi-poll-pending'
  ) then
    raise notice 'Job pix-sicredi-poll-pending já existe — mantido.';
    return;
  end if;

  perform cron.schedule(
    'pix-sicredi-poll-pending',
    '* * * * *',
    format(
      $cron$
      select net.http_post(
        url := %L,
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{"action":"poll_pending"}'::jsonb,
        timeout_milliseconds := 55000
      );
      $cron$,
      v_url
    )
  );
exception
  when undefined_table then
    raise notice 'pg_cron/pg_net indisponível — poll PIX não agendado.';
  when undefined_function then
    raise notice 'pg_cron/pg_net indisponível — poll PIX não agendado.';
  when others then
    raise notice 'Falha ao agendar poll PIX: %', SQLERRM;
end $$;
