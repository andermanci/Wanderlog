-- ============================================================
-- WANDERLOG - Diario de viaje por día (texto + fotos)
-- ============================================================

-- Texto del diario en cada día del itinerario.
alter table public.itinerary_days
  add column if not exists journal text;

-- Fotos del diario (archivos en el bucket público 'attachments').
create table if not exists public.journal_photos (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  day_id uuid not null references public.itinerary_days(id) on delete cascade,
  file_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_journal_photos_trip on public.journal_photos(trip_id);
create index if not exists idx_journal_photos_day on public.journal_photos(day_id);

alter table public.journal_photos enable row level security;

drop policy if exists "journal_photos_select" on public.journal_photos;
drop policy if exists "journal_photos_insert" on public.journal_photos;
drop policy if exists "journal_photos_delete" on public.journal_photos;

create policy "journal_photos_select" on public.journal_photos
  for select using (public.has_trip_access(trip_id));
create policy "journal_photos_insert" on public.journal_photos
  for insert with check (public.has_trip_access(trip_id));
create policy "journal_photos_delete" on public.journal_photos
  for delete using (public.has_trip_access(trip_id));
