-- ============================================================
-- WANDERLOG - Asociar guías de destino a días/lugares + mejoras
-- ============================================================
-- Un día (y un lugar guardado) puede pertenecer a una guía de destino (ciudad),
-- para dar contexto en el itinerario y en "Hoy". Además, las guías ganan portada,
-- orden y "datos rápidos" (moneda, idioma, emergencias...).

-- Día → ciudad (guía). Un día pertenece a una sola guía.
alter table public.itinerary_days
  add column if not exists guide_id uuid references public.destination_guides(id) on delete set null;
create index if not exists idx_itinerary_days_guide on public.itinerary_days(trip_id, guide_id);

-- Lugar guardado → ciudad (guía).
alter table public.favorite_places
  add column if not exists guide_id uuid references public.destination_guides(id) on delete set null;
create index if not exists idx_favorite_places_guide on public.favorite_places(trip_id, guide_id);

-- Mejoras de la guía: portada, orden y datos rápidos.
alter table public.destination_guides
  add column if not exists cover_image_url text,
  add column if not exists order_index int not null default 0,
  add column if not exists facts jsonb not null default '{}'::jsonb;
