-- ============================================================
-- WANDERLOG - Permisos por colaborador: ver / editar / compartir
-- ============================================================
-- Niveles jerárquicos: viewer < editor < admin.
--   viewer : ve todo el viaje (nivel por defecto al invitar)
--   editor : además puede editar (itinerario, gastos, documentos…)
--   admin  : además puede compartir el viaje con otros
-- Solo el dueño cambia niveles y puede quitar a cualquiera.
-- Los colaboradores existentes pasan a 'editor' (era su capacidad real).

-- ------------------------------------------------------------
-- Columna role
-- ------------------------------------------------------------
alter table public.trip_collaborators
  add column if not exists role text not null default 'viewer'
  constraint trip_collaborators_role_check check (role in ('viewer', 'editor', 'admin'));

-- Los que ya estaban podían editar: mantenerles ese nivel.
update public.trip_collaborators set role = 'editor' where role = 'viewer';

-- ------------------------------------------------------------
-- FUNCIONES de permiso (SECURITY DEFINER, mismas coincidencias
-- user_id/email que has_trip_access para invitados pendientes)
-- ------------------------------------------------------------
create or replace function public.can_edit_trip(p_trip_id uuid)
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
        and c.role in ('editor', 'admin')
        and (
          c.user_id = auth.uid()
          or lower(c.email) = lower(coalesce((select u.email from auth.users u where u.id = auth.uid()), ''))
        )
    );
$$;

create or replace function public.can_share_trip(p_trip_id uuid)
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
        and c.role = 'admin'
        and (
          c.user_id = auth.uid()
          or lower(c.email) = lower(coalesce((select u.email from auth.users u where u.id = auth.uid()), ''))
        )
    );
$$;

-- Rol efectivo del usuario actual en un viaje (para la UI).
create or replace function public.my_trip_role(p_trip_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    when exists (select 1 from public.trips t where t.id = p_trip_id and t.user_id = auth.uid())
      then 'owner'
    else (
      select c.role from public.trip_collaborators c
      where c.trip_id = p_trip_id
        and (
          c.user_id = auth.uid()
          or lower(c.email) = lower(coalesce((select u.email from auth.users u where u.id = auth.uid()), ''))
        )
      limit 1
    )
  end;
$$;

-- ------------------------------------------------------------
-- share_trip: dueño o colaborador con permiso de compartir.
-- Los invitados entran como 'viewer'.
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
  if not public.can_share_trip(p_trip_id) then
    raise exception 'No tienes permiso para compartir este viaje';
  end if;

  select email into v_self_email from auth.users where id = auth.uid();
  if lower(p_email) = lower(coalesce(v_self_email, '')) then
    raise exception 'No puedes compartir el viaje contigo mismo';
  end if;
  if exists (select 1 from auth.users u where u.id = v_owner and lower(u.email) = lower(p_email)) then
    raise exception 'Esa persona es la propietaria del viaje';
  end if;

  select id into v_uid from auth.users where lower(email) = lower(p_email);

  insert into public.trip_collaborators (trip_id, email, user_id, invited_by, role)
  values (p_trip_id, lower(p_email), v_uid, auth.uid(), 'viewer')
  on conflict (trip_id, email)
    do update set user_id = coalesce(excluded.user_id, public.trip_collaborators.user_id)
  returning * into v_row;

  return v_row;
end;
$$;

-- ------------------------------------------------------------
-- RLS de trip_collaborators
-- ------------------------------------------------------------
drop policy if exists "collab_insert" on public.trip_collaborators;
create policy "collab_insert" on public.trip_collaborators
  for insert with check (
    public.can_share_trip(trip_id) and invited_by = auth.uid()
  );

-- Cambiar el rol: solo el dueño del viaje.
drop policy if exists "collab_update" on public.trip_collaborators;
create policy "collab_update" on public.trip_collaborators
  for update using (
    exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
  );

-- ------------------------------------------------------------
-- Escritura en las tablas del viaje: exige can_edit_trip.
-- La lectura se queda como está (has_trip_access).
-- Se regeneran vía catálogo porque los nombres históricos varían.
-- ------------------------------------------------------------
do $$
declare
  r record;
  tbl text;
  tables text[] := array[
    'itinerary_days', 'activities', 'documents', 'packing_items',
    'expenses', 'favorite_places', 'activity_attachments', 'journal_photos',
    'travelers', 'destination_guides', 'audioguides', 'audioguide_stops',
    'day_alerts'
  ];
begin
  foreach tbl in array tables loop
    for r in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = tbl and cmd in ('INSERT', 'UPDATE', 'DELETE')
    loop
      execute format('drop policy %I on public.%I', r.policyname, tbl);
    end loop;
    execute format('create policy %I on public.%I for insert with check (public.can_edit_trip(trip_id))', tbl || '_insert_edit', tbl);
    execute format('create policy %I on public.%I for update using (public.can_edit_trip(trip_id))', tbl || '_update_edit', tbl);
    execute format('create policy %I on public.%I for delete using (public.can_edit_trip(trip_id))', tbl || '_delete_edit', tbl);
  end loop;
end $$;

-- day_alerts era la única tabla del viaje que solo veía el dueño
-- (inconsistencia previa): alinear su lectura con el resto.
drop policy if exists "day_alerts_select" on public.day_alerts;
create policy "day_alerts_select" on public.day_alerts
  for select using (public.has_trip_access(trip_id));

-- El viaje en sí: editable solo con permiso de edición (borrar sigue
-- siendo exclusivo del dueño, sin cambios).
drop policy if exists "trips_update_access" on public.trips;
create policy "trips_update_edit" on public.trips
  for update using (public.can_edit_trip(id));
