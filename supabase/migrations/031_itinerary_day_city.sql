-- ============================================================
-- WANDERLOG - Ciudad manual por día del itinerario
-- Campo simple (sin depender de las guías de destino) para mostrar
-- "dónde estoy" junto a la fecha en el listado del itinerario.
-- ============================================================

alter table public.itinerary_days
  add column if not exists city text;
