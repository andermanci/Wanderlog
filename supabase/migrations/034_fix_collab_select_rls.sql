-- ============================================================
-- WANDERLOG - Arregla el 403 al listar colaboradores
-- ============================================================
-- La política collab_select de 003 consultaba auth.users directamente,
-- pero el rol authenticated no tiene SELECT sobre esa tabla: cualquier
-- lectura de trip_collaborators devolvía "permission denied for table
-- users" (403), incluso para el propietario. Se sustituye por
-- has_trip_access() (SECURITY DEFINER), que además es la regla que
-- de verdad queremos: quien puede ver el viaje puede ver quién está.

drop policy if exists "collab_select" on public.trip_collaborators;
create policy "collab_select" on public.trip_collaborators
  for select using (public.has_trip_access(trip_id));
