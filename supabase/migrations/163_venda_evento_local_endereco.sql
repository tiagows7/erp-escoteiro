-- Local e endereço do evento de venda.

alter table public.venda_eventos
  add column if not exists local varchar(120);

alter table public.venda_eventos
  add column if not exists endereco text;

comment on column public.venda_eventos.local is
  'Nome do local do evento (ex.: sede, ginásio).';

comment on column public.venda_eventos.endereco is
  'Endereço completo do evento.';

drop function if exists public.venda_evento_public_info(uuid);

create function public.venda_evento_public_info(p_token uuid)
returns table (
  evento_id integer,
  evento_nome text,
  valor_convite numeric,
  numero_inicial integer,
  numero_final integer,
  data_evento date,
  imagem_url text,
  empresa_nome text,
  disponiveis integer,
  total integer,
  encerrado boolean,
  tipos jsonb,
  vendedor_nome text,
  associado_vendedor_id integer,
  pedir_participacao boolean,
  local text,
  endereco text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento public.venda_eventos%rowtype;
  v_vendidos integer;
  v_total integer;
  v_tipos jsonb;
  v_vendedor_nome text := null;
  v_associado_vendedor_id integer := null;
begin
  select e.* into v_evento
  from public.venda_evento_vendedor v
  join public.venda_eventos e on e.evento_id = v.evento_id
  where v.link_token = p_token;

  if found then
    select a.associado_id, a.nome
    into v_associado_vendedor_id, v_vendedor_nome
    from public.venda_evento_vendedor v
    join public.associados a on a.associado_id = v.associado_id
    where v.link_token = p_token;
  else
    select * into v_evento
    from public.venda_eventos e
    where e.link_token = p_token;

    if not found then
      return;
    end if;
  end if;

  v_total := v_evento.numero_final - v_evento.numero_inicial + 1;
  if v_total < 0 then
    v_total := 0;
  end if;

  select count(*)::integer into v_vendidos
  from public.venda_evento_convite c
  where c.evento_id = v_evento.evento_id
    and c.ativo = true;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tipo_id', t.tipo_id,
        'label', t.label,
        'valor', t.valor,
        'ordem', t.ordem
      )
      order by t.ordem, t.tipo_id
    ),
    '[]'::jsonb
  )
  into v_tipos
  from public.venda_evento_tipo t
  where t.evento_id = v_evento.evento_id
    and t.ativo = true;

  return query
  select
    v_evento.evento_id,
    v_evento.nome::text,
    v_evento.valor_convite,
    v_evento.numero_inicial,
    v_evento.numero_final,
    v_evento.data_evento,
    v_evento.imagem_url,
    coalesce(e.nome, '')::text,
    greatest(v_total - coalesce(v_vendidos, 0), 0),
    v_total,
    (v_evento.encerrado_em is not null),
    v_tipos,
    v_vendedor_nome,
    v_associado_vendedor_id,
    coalesce(v_evento.pedir_participacao, false),
    nullif(btrim(coalesce(v_evento.local, '')), '')::text,
    nullif(btrim(coalesce(v_evento.endereco, '')), '')::text
  from public.empresa e
  where e.id = v_evento.empresa_id;
end;
$$;

revoke all on function public.venda_evento_public_info(uuid) from public;
grant execute on function public.venda_evento_public_info(uuid)
  to anon, authenticated;
