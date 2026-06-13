-- ============================================================
-- WANDERLOG - Día de llegada en actividades (vuelos/trenes nocturnos)
-- ============================================================
-- Una actividad puede terminar en un día distinto (p. ej. un vuelo que
-- sale por la noche y aterriza al día siguiente). end_day_id apunta al
-- día de llegada; null = termina el mismo día (comportamiento actual).

alter table public.activities
  add column if not exists end_day_id uuid references public.itinerary_days(id) on delete set null;
