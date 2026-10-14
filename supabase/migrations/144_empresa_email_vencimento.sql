-- O aviso automático de mensalidade vencida só roda para o grupo que marcar.

alter table public.empresa
  add column if not exists envia_email_vencimento boolean not null default false;

comment on column public.empresa.envia_email_vencimento is
  'Quando true, o servidor envia e-mail de mensalidade vencida (2 dias após o vencimento e a cada 2 dias).';
