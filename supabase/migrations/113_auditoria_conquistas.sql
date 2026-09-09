-- Auditoria: conquistas

do $$
begin
  perform public.auditoria_attach('conquistas', 'conquista_id');
end;
$$;
