-- Imagem da ação entre amigos (aparece na tela de venda e no link público)

alter table public.acao_entre_amigos
  add column if not exists imagem_url text;

comment on column public.acao_entre_amigos.imagem_url is
  'URL pública da imagem promocional da ação';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'acao-entre-amigos',
  'acao-entre-amigos',
  true,
  2097152,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "acao_entre_amigos_img_public_read" on storage.objects;
create policy "acao_entre_amigos_img_public_read"
  on storage.objects
  for select
  using (bucket_id = 'acao-entre-amigos');

drop policy if exists "acao_entre_amigos_img_tenant_insert" on storage.objects;
create policy "acao_entre_amigos_img_tenant_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'acao-entre-amigos'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  );

drop policy if exists "acao_entre_amigos_img_tenant_update" on storage.objects;
create policy "acao_entre_amigos_img_tenant_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'acao-entre-amigos'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  )
  with check (
    bucket_id = 'acao-entre-amigos'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  );

drop policy if exists "acao_entre_amigos_img_tenant_delete" on storage.objects;
create policy "acao_entre_amigos_img_tenant_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'acao-entre-amigos'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_empresa_id()::text
    )
  );

drop function if exists public.acao_amigos_public_info(uuid);

create or replace function public.acao_amigos_public_info(p_token uuid)
returns table (
  acao_id integer,
  acao_nome text,
  valor_numero numeric,
  numero_inicial integer,
  numero_final integer,
  vendedor_nome text,
  empresa_nome text,
  numeros_vendidos integer[],
  imagem_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_faixa public.acao_entre_amigos_faixa%rowtype;
begin
  select * into v_faixa
  from public.acao_entre_amigos_faixa f
  where f.link_token = p_token;

  if not found then
    return;
  end if;

  return query
  select
    a.acao_id,
    a.nome::text,
    a.valor_numero,
    v_faixa.numero_inicial,
    v_faixa.numero_final,
    coalesce(assoc.nome, 'Vendedor')::text,
    coalesce(e.nome, '')::text,
    coalesce(
      (
        select array_agg(v.numero order by v.numero)
        from public.acao_entre_amigos_venda v
        where v.acao_id = a.acao_id
          and v.numero between v_faixa.numero_inicial and v_faixa.numero_final
      ),
      '{}'::integer[]
    ),
    a.imagem_url
  from public.acao_entre_amigos a
  join public.empresa e on e.id = a.empresa_id
  left join public.associados assoc on assoc.associado_id = v_faixa.associado_id
  where a.acao_id = v_faixa.acao_id
    and a.empresa_id = v_faixa.empresa_id;
end;
$$;

revoke all on function public.acao_amigos_public_info(uuid) from public;
grant execute on function public.acao_amigos_public_info(uuid) to anon, authenticated;
