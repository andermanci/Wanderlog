-- ============================================================
-- WANDERLOG - El bucket 'documents' vuelve a ser PRIVADO
-- ============================================================
-- Revierte 013_documents_bucket_public.sql, que lo hizo público y sustituyó la
-- política de SELECT de 001 (con comprobación de dueño) por una sin ninguna:
--   for select using (bucket_id = 'documents')
-- Efecto: las fotos de DNI, pasaporte, visado y tarjeta sanitaria (categorías
-- de 010_personal_documents.sql) eran descargables por URL sin autenticación, y
-- enumerables con .list() usando la anon key, que va en el bundle JS.
--
-- 013 lo hizo público porque el cliente usaba getPublicUrl() y las imágenes no
-- se podían cachear offline. Eso ya no aplica: ahora el cliente guarda el PATH,
-- lo lee con createSignedUrl() y descarga los blobs a su propia caché
-- (src/lib/docCache.ts), así que sigue funcionando sin conexión.
--
-- ⚠️ Desplegar el frontend ANTES que esta migración. Una URL firmada funciona
-- también contra un bucket público, así que el frontend nuevo es compatible con
-- el estado viejo de la BD; al revés no (los clientes con getPublicUrl() verían
-- las imágenes en blanco).

-- 1) Normalizar los datos: URL pública absoluta -> path relativo.
update documents
   set file_url = regexp_replace(file_url, '^.*/storage/v1/object/public/documents/', ''),
       back_url = regexp_replace(back_url, '^.*/storage/v1/object/public/documents/', '')
 where file_url like '%/object/public/documents/%'
    or back_url like '%/object/public/documents/%';

-- 2) Bucket privado (se mantienen el límite de tamaño y los mime types de 013).
update storage.buckets set public = false where id = 'documents';

-- 3) Lectura: quien lo subió, o cualquiera con acceso al viaje.
--    El path es {userId}/{tripId}/{ts}.ext, así que el 2º segmento identifica el
--    viaje. Hace falta contemplarlo: las políticas de la tabla `documents` usan
--    has_trip_access(trip_id), y sin esto un colaborador vería la fila de la
--    reserva pero no podría cargar el fichero.
--    El regex protege el cast a uuid: un path inesperado tumbaría la política.
drop policy if exists "documents_storage_select" on storage.objects;
create policy "documents_storage_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or (
        (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and public.has_trip_access(((storage.foldername(name))[2])::uuid)
      )
    )
  );

-- Escritura: se queda como en 013 (solo el dueño de la carpeta), pero acotada a
-- usuarios autenticados en vez de a `public`.
drop policy if exists "documents_storage_insert" on storage.objects;
create policy "documents_storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "documents_storage_update" on storage.objects;
create policy "documents_storage_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "documents_storage_delete" on storage.objects;
create policy "documents_storage_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);
