-- ============================================================
-- WANDERLOG - Marcar actividades como hechas/visitadas
-- ============================================================
-- En el modo "Ver" del itinerario (en pleno viaje) se puede marcar cada
-- actividad como hecha. Las hechas se muestran atenuadas y tachadas.
-- RLS ya cubierta por las políticas de activities (acceso vía trip del usuario).

alter table public.activities
  add column if not exists done boolean not null default false;
