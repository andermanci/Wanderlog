-- ============================================================
-- WANDERLOG - Compartir viajes con otros usuarios
-- ============================================================

-- ------------------------------------------------------------
-- TABLA: trip_collaborators
-- ------------------------------------------------------------
create table if not exists public.trip_collaborators (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  email text not null,
  user_id uuid references public.profiles(id) on delete set null,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (trip_id, email)
);

create index if not exists idx_trip_collaborators_trip on public.trip_collaborators(trip_id);
create index if not exists idx_trip_collaborators_email on public.trip_collaborators(lower(email));
create index if not exists idx_trip_collaborators_user on public.trip_collaborators(user_id);

alter table public.trip_collaborators enable row level security;

-- ------------------------------------------------------------
-- FUNCIÓN: has_trip_access(trip_id)
-- Devuelve true si el usuario actual es propietario o colaborador.
-- SECURITY DEFINER para evitar recursión de RLS.
-- ------------------------------------------------------------
create or replace function public.has_trip_access(p_trip_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    exists (
      select 1 from public.trips t
      where t.id = p_trip_id and t.user_id = auth.uid()
    )
    or exists (
      select 1 from public.trip_collaborators c
      where c.trip_id = p_trip_id
        and (
          c.user_id = auth.uid()
          or lower(c.email) = lower(coalesce((select u.email from auth.users u where u.id = auth.uid()), ''))
        )
    );
$$;

-- ------------------------------------------------------------
-- FUNCIÓN: share_trip(trip_id, email)
-- Solo el propietario puede invitar. Resuelve el user_id si el
-- invitado ya tiene cuenta; si no, queda pendiente por email.
-- ------------------------------------------------------------
create or replace function public.share_trip(p_trip_id uuid, p_email text)
returns public.trip_collaborators
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_uid uuid;
  v_self_email text;
  v_row public.trip_collaborators;
begin
  select user_id into v_owner from public.trips where id = p_trip_id;
  if v_owner is null then
    raise exception 'Viaje no encontrado';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'Solo el propietario puede compartir el viaje';
  end if;

  select email into v_self_email from auth.users where id = auth.uid();
  if lower(p_email) = lower(coalesce(v_self_email, '')) then
    raise exception 'No puedes compartir el viaje contigo mismo';
  end if;

  select id into v_uid from auth.users where lower(email) = lower(p_email);

  insert into public.trip_collaborators (trip_id, email, user_id, invited_by)
  values (p_trip_id, lower(p_email), v_uid, auth.uid())
  on conflict (trip_id, email)
    do update set user_id = coalesce(excluded.user_id, public.trip_collaborators.user_id)
  returning * into v_row;

  return v_row;
end;
$$;

-- ------------------------------------------------------------
-- RLS: trip_collaborators
-- ------------------------------------------------------------
drop policy if exists "collab_select" on public.trip_collaborators;
drop policy if exists "collab_insert" on public.trip_collaborators;
drop policy if exists "collab_delete" on public.trip_collaborators;

create policy "collab_select" on public.trip_collaborators
  for select using (
    exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
    or user_id = auth.uid()
    or lower(email) = lower(coalesce((select email from auth.users where id = auth.uid()), ''))
  );

create policy "collab_insert" on public.trip_collaborators
  for insert with check (
    exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
  );

create policy "collab_delete" on public.trip_collaborators
  for delete using (
    exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
  );

-- ------------------------------------------------------------
-- RLS: rehacer políticas para incluir colaboradores
-- ------------------------------------------------------------

-- TRIPS: ver/editar si tienes acceso; borrar solo propietario
drop policy if exists "trips_select_own" on public.trips;
drop policy if exists "trips_insert_own" on public.trips;
drop policy if exists "trips_update_own" on public.trips;
drop policy if exists "trips_delete_own" on public.trips;

create policy "trips_select_access" on public.trips
  for select using (public.has_trip_access(id));
create policy "trips_insert_own" on public.trips
  for insert with check (auth.uid() = user_id);
create policy "trips_update_access" on public.trips
  for update using (public.has_trip_access(id));
create policy "trips_delete_own" on public.trips
  for delete using (auth.uid() = user_id);

-- Helper para regenerar las 4 políticas CRUD de una tabla hija
do $$
declare
  tbl text;
  tables text[] := array['itinerary_days','activities','documents','packing_items','expenses','favorite_places'];
begin
  foreach tbl in array tables loop
    execute format('drop policy if exists %I on public.%I', tbl || '_select', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_insert', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_update', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_delete', tbl);
    -- nombres antiguos de packing
    execute format('drop policy if exists %I on public.%I', 'packing_select', tbl);
    execute format('drop policy if exists %I on public.%I', 'packing_insert', tbl);
    execute format('drop policy if exists %I on public.%I', 'packing_update', tbl);
    execute format('drop policy if exists %I on public.%I', 'packing_delete', tbl);

    execute format('create policy %I on public.%I for select using (public.has_trip_access(trip_id))', tbl || '_select_access', tbl);
    execute format('create policy %I on public.%I for insert with check (public.has_trip_access(trip_id))', tbl || '_insert_access', tbl);
    execute format('create policy %I on public.%I for update using (public.has_trip_access(trip_id))', tbl || '_update_access', tbl);
    execute format('create policy %I on public.%I for delete using (public.has_trip_access(trip_id))', tbl || '_delete_access', tbl);
  end loop;
end $$;

-- NOTA: reminders se mantiene personal (por user_id), no se comparte.
