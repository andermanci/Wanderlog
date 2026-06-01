-- ============================================================
-- WANDERLOG - Origen y destino para actividades de transporte
-- ============================================================
alter table public.activities
  add column if not exists origin text,
  add column if not exists destination text;
