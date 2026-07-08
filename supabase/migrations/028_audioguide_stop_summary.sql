-- ============================================================
-- WANDERLOG - Resumen corto por parada de audioguía
-- Permite ver de un vistazo qué cuenta cada parada antes de
-- escucharla o saltarla.
-- ============================================================

alter table public.audioguide_stops
  add column if not exists summary text;
