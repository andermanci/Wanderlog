-- ============================================================
-- WANDERLOG - Importación bancaria (Revolut vía GoCardless)
-- ============================================================

-- ------------------------------------------------------------
-- TABLA: bank_connections
-- Una conexión de open banking por usuario y viaje.
-- ------------------------------------------------------------
create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  provider text not null default 'revolut',
  requisition_id text not null,
  account_id text,
  institution_id text,
  status text not null default 'pending'
    check (status in ('pending','linked','expired','error')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_bank_connections_user on public.bank_connections(user_id);
create index if not exists idx_bank_connections_trip on public.bank_connections(trip_id);
create index if not exists idx_bank_connections_requisition on public.bank_connections(requisition_id);

alter table public.bank_connections enable row level security;

drop policy if exists "bank_connections_select" on public.bank_connections;
drop policy if exists "bank_connections_insert" on public.bank_connections;
drop policy if exists "bank_connections_update" on public.bank_connections;
drop policy if exists "bank_connections_delete" on public.bank_connections;

create policy "bank_connections_select" on public.bank_connections
  for select using (auth.uid() = user_id);
create policy "bank_connections_insert" on public.bank_connections
  for insert with check (auth.uid() = user_id);
create policy "bank_connections_update" on public.bank_connections
  for update using (auth.uid() = user_id);
create policy "bank_connections_delete" on public.bank_connections
  for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- EXPENSES: origen y deduplicación de transacciones importadas
-- ------------------------------------------------------------
alter table public.expenses
  add column if not exists external_id text,
  add column if not exists source text not null default 'manual';

-- Evita reimportar el mismo movimiento dos veces en el mismo viaje.
create unique index if not exists uq_expenses_trip_external
  on public.expenses(trip_id, external_id)
  where external_id is not null;
