-- ============================================================
-- WANDERLOG - Fix: INSERT ... RETURNING en trips fallaba con 42501
-- ============================================================
-- La política SELECT de trips usaba solo has_trip_access(id), una función
-- SECURITY DEFINER. Al insertar con RETURNING (lo que hace .insert().select()),
-- PostgreSQL evalúa la política SELECT sobre la fila nueva, pero la consulta
-- interna de has_trip_access no "ve" la fila aún en vuelo y devuelve false,
-- provocando "new row violates row-level security policy".
--
-- Solución: comprobar primero user_id = auth.uid() (se evalúa directamente
-- contra las columnas de la fila nueva, sin consultar) y dejar has_trip_access
-- para el caso de colaboradores.
-- ============================================================

alter policy "trips_select_access" on public.trips
  using (user_id = auth.uid() or public.has_trip_access(id));

alter policy "trips_update_access" on public.trips
  using (user_id = auth.uid() or public.has_trip_access(id));

-- Limpieza de funciones de diagnóstico temporales.
drop function if exists public.debug_whoami();
drop function if exists public.debug_insert_trip();
