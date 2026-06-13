-- ============================================================
-- WANDERLOG - Viajeros del viaje + documentación de identidad
-- ============================================================
-- Cada viaje tiene una lista de viajeros; a cada uno se le asocian sus
-- documentos de identidad (DNI/pasaporte/...) con anverso y reverso.

-- ------------------------------------------------------------
-- TABLA: travelers
-- ------------------------------------------------------------
create table if not exists public.travelers (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null,
  is_self boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_travelers_trip on public.travelers(trip_id);

alter table public.travelers enable row level security;

drop policy if exists "travelers_select" on public.travelers;
drop policy if exists "travelers_insert" on public.travelers;
drop policy if exists "travelers_update" on public.travelers;
drop policy if exists "travelers_delete" on public.travelers;

create policy "travelers_select" on public.travelers
  for select using (public.has_trip_access(trip_id));
create policy "travelers_insert" on public.travelers
  for insert with check (public.has_trip_access(trip_id));
create policy "travelers_update" on public.travelers
  for update using (public.has_trip_access(trip_id));
create policy "travelers_delete" on public.travelers
  for delete using (public.has_trip_access(trip_id));

-- ------------------------------------------------------------
-- documents: viajero asociado + reverso (anverso = file_url)
-- ------------------------------------------------------------
alter table public.documents
  add column if not exists traveler_id uuid references public.travelers(id) on delete set null,
  add column if not exists back_url text;

create index if not exists idx_documents_traveler on public.documents(traveler_id);
