-- ============================================================
-- WANDERLOG - Coordenadas en actividades
-- ============================================================
-- Guardamos lat/lng al elegir ubicación (antes solo el texto), para
-- mostrar el itinerario en el mapa sin re-geocodificar y trazar el
-- recorrido al instante.

alter table public.activities
  add column if not exists lat numeric(10,7),
  add column if not exists lng numeric(10,7),
  add column if not exists origin_lat numeric(10,7),
  add column if not exists origin_lng numeric(10,7),
  add column if not exists destination_lat numeric(10,7),
  add column if not exists destination_lng numeric(10,7);
