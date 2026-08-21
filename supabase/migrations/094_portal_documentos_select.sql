-- Portal da transparência: permitir ver documentos anexados (assinatura de URL).
-- Buckets continuam privados (public=false); anon só lê objetos de grupos com
-- portal_transparencia ativo (path começa com empresa_id).

drop policy if exists "despesa_notas_portal_select" on storage.objects;
create policy "despesa_notas_portal_select"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'despesa-notas'
    and exists (
      select 1
      from public.empresa e
      where e.portal_transparencia is true
        and coalesce(e.ativo, true) is true
        and (storage.foldername(name))[1] = e.id::text
    )
  );

drop policy if exists "receita_comprovantes_portal_select" on storage.objects;
create policy "receita_comprovantes_portal_select"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'receita-comprovantes'
    and exists (
      select 1
      from public.empresa e
      where e.portal_transparencia is true
        and coalesce(e.ativo, true) is true
        and (storage.foldername(name))[1] = e.id::text
    )
  );
