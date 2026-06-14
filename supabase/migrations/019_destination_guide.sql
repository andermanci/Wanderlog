-- ============================================================
-- WANDERLOG - Guía del destino (historia, costumbres, etc.)
-- ============================================================
-- Una guía editable por viaje. El contenido se importa de APIs públicas
-- (Wikivoyage / Wikipedia) y luego el usuario puede editarlo. Se guarda como
-- array de secciones en jsonb: { id, title, body, source, url, edited }.

create table if not exists public.destination_guides (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  sections jsonb not null default '[]'::jsonb,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id)
);

create index if not exists idx_destination_guides_trip on public.destination_guides(trip_id);

alter table public.destination_guides enable row level security;

drop policy if exists "destination_guides_select" on public.destination_guides;
drop policy if exists "destination_guides_insert" on public.destination_guides;
drop policy if exists "destination_guides_update" on public.destination_guides;
drop policy if exists "destination_guides_delete" on public.destination_guides;

create policy "destination_guides_select" on public.destination_guides
  for select using (public.has_trip_access(trip_id));
create policy "destination_guides_insert" on public.destination_guides
  for insert with check (public.has_trip_access(trip_id));
create policy "destination_guides_update" on public.destination_guides
  for update using (public.has_trip_access(trip_id));
create policy "destination_guides_delete" on public.destination_guides
  for delete using (public.has_trip_access(trip_id));
