-- ============================================================
-- WANDERLOG - Transporte público en los trayectos del itinerario
-- ============================================================
-- Para los trayectos que el itinerario pinta "en coche" (dos actividades
-- seguidas a más de 1,1 km), una sugerencia de cómo hacerlos en metro, tren o
-- bus: líneas, estación de subida y de bajada, transbordos.
--
-- No es tiempo real: se genera una vez al organizar el viaje, pegando en una
-- IA el prompt que arma la app (src/lib/transit/exchange.ts), y se guarda.
-- Google Directions no sirve aquí porque su API no da rutas de transporte
-- público en Japón.
--
-- Una fila por par (desde, hasta), igual que pairKey() en el cliente. Si una
-- de las dos actividades cambia de sitio, coords_sig deja de coincidir y la
-- sugerencia se da por caducada.
--
-- No se copia en versiones ni en duplicate_trip: depende de los ids de las
-- actividades y se puede regenerar.

create table if not exists public.transit_routes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  from_activity_id uuid not null references public.activities(id) on delete cascade,
  to_activity_id uuid not null references public.activities(id) on delete cascade,
  coords_sig text not null,
  worth_it boolean not null,
  total_minutes integer,
  summary text,
  fare_text text,
  note text,
  -- [{ kind, line, operator, line_color, from_station, to_station, stops, minutes, direction }]
  steps jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  unique (from_activity_id, to_activity_id)
);

create index if not exists idx_transit_routes_trip on public.transit_routes(trip_id);

alter table public.transit_routes enable row level security;

drop policy if exists "transit_routes_select" on public.transit_routes;
drop policy if exists "transit_routes_insert" on public.transit_routes;
drop policy if exists "transit_routes_update" on public.transit_routes;
drop policy if exists "transit_routes_delete" on public.transit_routes;

create policy "transit_routes_select" on public.transit_routes
  for select using (public.has_trip_access(trip_id));
create policy "transit_routes_insert" on public.transit_routes
  for insert with check (public.can_edit_trip(trip_id));
create policy "transit_routes_update" on public.transit_routes
  for update using (public.can_edit_trip(trip_id));
create policy "transit_routes_delete" on public.transit_routes
  for delete using (public.can_edit_trip(trip_id));
