-- ============================================================
-- WANDERLOG - Alertas destacadas por día (day_alerts)
-- ============================================================
-- Cada día del itinerario puede tener varias alertas/callouts llamativos
-- (ej. "Recomendado madrugar para aprovechar el día!"), con un nivel que
-- determina icono y color (consejo / info / importante). Opcionalmente, una
-- alerta puede enlazar con un reminder para disparar una notificación push
-- reutilizando el pipeline existente (reminders + send-reminders + web push).

create table if not exists public.day_alerts (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  day_id uuid not null references public.itinerary_days(id) on delete cascade,
  text text not null,
  level text not null default 'tip'
    check (level in ('tip','info','warning')),
  -- Notificación opcional. on delete set null: borrar el reminder no borra la alerta.
  reminder_id uuid references public.reminders(id) on delete set null,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_day_alerts_day on public.day_alerts(day_id);
create index if not exists idx_day_alerts_trip on public.day_alerts(trip_id);

-- ============================================================
-- RLS (acceso vía trip_id que pertenece al usuario), igual que itinerary_days.
-- ============================================================
alter table public.day_alerts enable row level security;

create policy "day_alerts_select" on public.day_alerts
  for select using (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
create policy "day_alerts_insert" on public.day_alerts
  for insert with check (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
create policy "day_alerts_update" on public.day_alerts
  for update using (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
create policy "day_alerts_delete" on public.day_alerts
  for delete using (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
