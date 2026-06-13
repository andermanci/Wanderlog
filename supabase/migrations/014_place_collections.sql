-- ============================================================
-- WANDERLOG - Colecciones (listas) de lugares guardados
-- ============================================================
-- Eje de organización propio del usuario, además de la categoría/tipo:
-- "Favoritos de Roma", "Comida japonesa", etc. Texto libre, nullable.

alter table public.favorite_places
  add column if not exists collection text;

create index if not exists idx_favorite_places_collection
  on public.favorite_places(trip_id, collection);
