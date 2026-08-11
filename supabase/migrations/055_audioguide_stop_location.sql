-- ============================================================
-- WANDERLOG - Ubicación de cada parada de la audioguía
-- ============================================================
-- Hasta ahora la única pista de dónde estaba una parada era direction_text
-- ("gira a la izquierda desde la parada anterior"), que no sirve si la
-- audioguía recorre una zona extensa y te incorporas a mitad de camino.
--
-- place_query: el nombre buscable del sitio que da la IA (campo LUGAR del
--   guion). NULL en las audioguías creadas antes de esta migración.
-- geo_status: 'pending' = aún sin intentar; 'located' = tiene lat/lng;
--   'unlocated' = ya se intentó geocodificar y no hay un sitio real detrás
--   (salas interiores, títulos narrativos). Guardar el intento fallido es lo
--   que evita repetir la llamada al Geocoder en cada apertura.

alter table public.audioguide_stops
  add column if not exists place_query text,
  add column if not exists lat numeric(10,7),
  add column if not exists lng numeric(10,7),
  add column if not exists geo_status text not null default 'pending'
    check (geo_status in ('pending','located','unlocated'));
