-- ============================================================
-- WANDERLOG - Reparto de gastos entre viajeros
-- ============================================================
-- Cada gasto puede tener un pagador (paid_by) y repartirse a partes iguales
-- entre varios viajeros (split_between). Vacío = gasto personal / sin repartir.

alter table public.expenses
  add column if not exists paid_by uuid references public.travelers(id) on delete set null,
  add column if not exists split_between uuid[] not null default '{}'::uuid[];
