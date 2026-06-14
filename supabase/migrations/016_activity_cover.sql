-- ============================================================
-- WANDERLOG - Foto de portada por actividad
-- ============================================================
-- Imagen para visualizar la actividad (subida por el usuario o tomada de
-- Google al asociar un lugar). Se muestra en el itinerario y en el detalle.

alter table public.activities
  add column if not exists cover_image_url text;
