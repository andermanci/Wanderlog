-- ============================================================
-- WANDERLOG - Velocidad de reproducción compartida en la escucha en grupo
-- ============================================================

alter table public.audioguides
  add column if not exists playback_rate numeric not null default 1;
