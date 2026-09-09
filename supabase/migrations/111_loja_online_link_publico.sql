-- Link público permanente da loja online de cada grupo

alter table public.empresa
  add column if not exists loja_link_token uuid
    not null default gen_random_uuid();

create unique index if not exists empresa_loja_link_token_uq
  on public.empresa (loja_link_token);

create or replace function public.loja_online_public_info(p_token uuid)
returns table (
  empresa_nome text,
  produtos jsonb,
  grupos jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.nome::text,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'produto_id', p.produto_id,
            'nome', p.nome,
            'grupo', p.grupo,
            'valor_venda', p.valor_venda,
            'estoque_atual', p.estoque_atual,
            'controla_estoque', p.controla_estoque,
            'imagem_url', p.imagem_url
          )
          order by p.nome
        )
        from public.produto p
        where p.empresa_id = e.id
          and p.ativo = true
          and p.venda = true
      ),
      '[]'::jsonb
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'grupoproduto_id', g.grupoproduto_id,
            'nome', g.nome
          )
          order by g.nome
        )
        from public.grupo_produto g
        where g.empresa_id = e.id
      ),
      '[]'::jsonb
    )
  from public.empresa e
  where e.loja_link_token = p_token
    and coalesce(e.ativo, true) = true;
$$;

revoke all on function public.loja_online_public_info(uuid) from public;
grant execute on function public.loja_online_public_info(uuid)
  to anon, authenticated;

comment on column public.empresa.loja_link_token is
  'Token permanente do link público da loja online.';
