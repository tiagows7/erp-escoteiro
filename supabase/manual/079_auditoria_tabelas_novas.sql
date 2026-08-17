-- Auditoria nas tabelas novas / que faltavam no attach da 068.

do $$
begin
  perform public.auditoria_attach('loja_pedido', 'pedido_id');
  perform public.auditoria_attach('loja_pedido_item', 'item_id');
  perform public.auditoria_attach('empresa_saldo_local', 'id');
  perform public.auditoria_attach('infinitepay_pedidos', 'id');
end;
$$;
