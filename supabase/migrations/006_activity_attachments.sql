-- ============================================================
-- WANDERLOG - Adjuntos por actividad (wallet: entradas, QRs, PDFs)
-- ============================================================

-- ------------------------------------------------------------
-- BUCKET público para adjuntos (imágenes y PDFs)
-- Público para poder mostrar QRs/entradas al instante por URL.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', true, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

drop policy if exists "attachments_select" on storage.objects;
drop policy if exists "attachments_insert" on storage.objects;
drop policy if exists "attachments_update" on storage.objects;
drop policy if exists "attachments_delete" on storage.objects;

create policy "attachments_select" on storage.objects
  for select using (bucket_id = 'attachments');
create policy "attachments_insert" on storage.objects
  for insert with check (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "attachments_update" on storage.objects
  for update using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "attachments_delete" on storage.objects
  for delete using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);

-- ------------------------------------------------------------
-- TABLA: activity_attachments
-- ------------------------------------------------------------
create table if not exists public.activity_attachments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null,
  file_url text not null,
  mime text,
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_attachments_activity on public.activity_attachments(activity_id);
create index if not exists idx_activity_attachments_trip on public.activity_attachments(trip_id);

alter table public.activity_attachments enable row level security;

drop policy if exists "activity_attachments_select" on public.activity_attachments;
drop policy if exists "activity_attachments_insert" on public.activity_attachments;
drop policy if exists "activity_attachments_update" on public.activity_attachments;
drop policy if exists "activity_attachments_delete" on public.activity_attachments;

create policy "activity_attachments_select" on public.activity_attachments
  for select using (public.has_trip_access(trip_id));
create policy "activity_attachments_insert" on public.activity_attachments
  for insert with check (public.has_trip_access(trip_id));
create policy "activity_attachments_update" on public.activity_attachments
  for update using (public.has_trip_access(trip_id));
create policy "activity_attachments_delete" on public.activity_attachments
  for delete using (public.has_trip_access(trip_id));
