-- ============================================================
-- WANDERLOG - Varias guías por viaje (una por destino)
-- ============================================================
-- Antes había una sola guía por viaje (unique trip_id). Ahora un viaje puede
-- tener varias guías de destino (Singapur, Bali, ...), cada una con su nombre y
-- sus secciones importables/editables. Identidad por `id`; se elimina el unique
-- por trip_id y se añade `name`.

alter table public.destination_guides
  add column if not exists name text;

-- Backfill: la guía existente toma el nombre del destino del viaje.
update public.destination_guides g
  set name = coalesce((select t.destination from public.trips t where t.id = g.trip_id), 'Destino')
  where name is null or name = '';

alter table public.destination_guides
  alter column name set default '';
alter table public.destination_guides
  alter column name set not null;

-- Se permite más de una guía por viaje.
alter table public.destination_guides
  drop constraint if exists destination_guides_trip_id_key;
