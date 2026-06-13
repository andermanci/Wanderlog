-- ============================================================
-- WANDERLOG - El bucket 'documents' debe ser público
-- ============================================================
-- El código usa getPublicUrl() (/object/public/documents/...), pero el bucket
-- estaba como privado → las imágenes de DNI/billetes salían en blanco y no se
-- podían cachear offline. Lo igualamos a 'attachments' (público) + políticas.

update storage.buckets
  set public = true,
      file_size_limit = 10485760,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
  where id = 'documents';

drop policy if exists "documents_storage_select" on storage.objects;
drop policy if exists "documents_storage_insert" on storage.objects;
drop policy if exists "documents_storage_update" on storage.objects;
drop policy if exists "documents_storage_delete" on storage.objects;

create policy "documents_storage_select" on storage.objects
  for select using (bucket_id = 'documents');
create policy "documents_storage_insert" on storage.objects
  for insert with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "documents_storage_update" on storage.objects
  for update using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "documents_storage_delete" on storage.objects
  for delete using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);
