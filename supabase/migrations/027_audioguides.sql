-- ============================================================
-- WANDERLOG - Audioguías generadas con Claude + Google Cloud TTS
-- ============================================================

-- ------------------------------------------------------------
-- BUCKET público para los MP3 de audioguía
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audioguides', 'audioguides', true, 15728640, array['audio/mpeg'])
on conflict (id) do nothing;

drop policy if exists "audioguides_select" on storage.objects;
drop policy if exists "audioguides_insert" on storage.objects;
drop policy if exists "audioguides_update" on storage.objects;
drop policy if exists "audioguides_delete" on storage.objects;

create policy "audioguides_select" on storage.objects
  for select using (bucket_id = 'audioguides');
create policy "audioguides_insert" on storage.objects
  for insert with check (bucket_id = 'audioguides' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "audioguides_update" on storage.objects
  for update using (bucket_id = 'audioguides' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "audioguides_delete" on storage.objects
  for delete using (bucket_id = 'audioguides' and auth.uid()::text = (storage.foldername(name))[1]);

-- ------------------------------------------------------------
-- TABLA: audioguides (una por actividad, con el texto pegado de Claude)
-- ------------------------------------------------------------
create table if not exists public.audioguides (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null unique references public.activities(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  raw_text text not null,
  status text not null default 'generating' check (status in ('draft', 'generating', 'ready', 'error')),
  created_at timestamptz not null default now()
);

create index if not exists idx_audioguides_trip on public.audioguides(trip_id);

alter table public.audioguides enable row level security;

drop policy if exists "audioguides_rows_select" on public.audioguides;
drop policy if exists "audioguides_rows_insert" on public.audioguides;
drop policy if exists "audioguides_rows_update" on public.audioguides;
drop policy if exists "audioguides_rows_delete" on public.audioguides;

create policy "audioguides_rows_select" on public.audioguides
  for select using (public.has_trip_access(trip_id));
create policy "audioguides_rows_insert" on public.audioguides
  for insert with check (public.has_trip_access(trip_id));
create policy "audioguides_rows_update" on public.audioguides
  for update using (public.has_trip_access(trip_id));
create policy "audioguides_rows_delete" on public.audioguides
  for delete using (public.has_trip_access(trip_id));

-- ------------------------------------------------------------
-- TABLA: audioguide_stops (paradas parseadas del guion + su mp3)
-- ------------------------------------------------------------
create table if not exists public.audioguide_stops (
  id uuid primary key default gen_random_uuid(),
  audioguide_id uuid not null references public.audioguides(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  order_index int not null,
  title text not null,
  direction_text text,
  script_text text not null,
  audio_url text,
  audio_duration_seconds numeric,
  status text not null default 'pending' check (status in ('pending', 'generating', 'ready', 'error')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audioguide_stops_audioguide on public.audioguide_stops(audioguide_id, order_index);

alter table public.audioguide_stops enable row level security;

drop policy if exists "audioguide_stops_select" on public.audioguide_stops;
drop policy if exists "audioguide_stops_insert" on public.audioguide_stops;
drop policy if exists "audioguide_stops_update" on public.audioguide_stops;
drop policy if exists "audioguide_stops_delete" on public.audioguide_stops;

create policy "audioguide_stops_select" on public.audioguide_stops
  for select using (public.has_trip_access(trip_id));
create policy "audioguide_stops_insert" on public.audioguide_stops
  for insert with check (public.has_trip_access(trip_id));
create policy "audioguide_stops_update" on public.audioguide_stops
  for update using (public.has_trip_access(trip_id));
create policy "audioguide_stops_delete" on public.audioguide_stops
  for delete using (public.has_trip_access(trip_id));
