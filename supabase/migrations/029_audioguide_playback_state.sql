-- ============================================================
-- WANDERLOG - Estado de reproducción en grupo de la audioguía
-- Permite que quien se une tarde a una escucha en grupo arranque
-- ya sincronizado con lo que están escuchando los demás.
-- ============================================================

alter table public.audioguides
  add column if not exists playback_stop_id uuid references public.audioguide_stops(id) on delete set null,
  add column if not exists playback_position_seconds numeric not null default 0,
  add column if not exists playback_is_playing boolean not null default false,
  add column if not exists playback_updated_at timestamptz not null default now();
