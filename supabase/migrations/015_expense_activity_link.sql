-- ============================================================
-- WANDERLOG - Enlace gasto ↔ actividad del itinerario
-- ============================================================
-- Permite registrar el precio de una actividad como gasto y no volver a
-- ofrecerlo (dedupe). Nullable: los gastos manuales no llevan actividad.

alter table public.expenses
  add column if not exists activity_id uuid references public.activities(id) on delete set null;

create index if not exists idx_expenses_activity on public.expenses(activity_id);
