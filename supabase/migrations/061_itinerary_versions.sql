-- ============================================================
-- WANDERLOG - Versiones del itinerario
-- ============================================================
-- Una versión es una FOTO de las actividades de un viaje. Se edita siempre el
-- itinerario normal; las versiones sirven para compararlo con otra forma de
-- organizar el viaje y, si convence más, volver a ella.
--
-- Por qué una foto y no duplicar el viaje: duplicate_trip no copia documentos,
-- gastos, audioguías ni colaboradores, y las dos copias divergen. Aquí todo eso
-- sigue en un único viaje y solo se guarda lo que cambia al reorganizar.
--
-- La foto guarda cada actividad con la FECHA de su día ('date', 'end_date', y
-- las claves de day_orders), no con el id del día: así sigue valiendo aunque
-- los días se recreen.

create table if not exists public.itinerary_versions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null,
  source text not null default 'manual' check (source in ('manual','auto','claude')),
  -- Solo las propuestas de Claude: resumen general y explicación por fecha.
  summary text,
  explanations jsonb not null default '{}'::jsonb,
  snapshot jsonb not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_itinerary_versions_trip on public.itinerary_versions(trip_id, created_at desc);

alter table public.itinerary_versions enable row level security;

drop policy if exists "itinerary_versions_select" on public.itinerary_versions;
drop policy if exists "itinerary_versions_insert" on public.itinerary_versions;
drop policy if exists "itinerary_versions_update" on public.itinerary_versions;
drop policy if exists "itinerary_versions_delete" on public.itinerary_versions;

create policy "itinerary_versions_select" on public.itinerary_versions
  for select using (public.has_trip_access(trip_id));
create policy "itinerary_versions_insert" on public.itinerary_versions
  for insert with check (public.can_edit_trip(trip_id));
create policy "itinerary_versions_update" on public.itinerary_versions
  for update using (public.can_edit_trip(trip_id));
create policy "itinerary_versions_delete" on public.itinerary_versions
  for delete using (public.can_edit_trip(trip_id));

-- ------------------------------------------------------------
-- Foto del itinerario actual (security invoker: respeta la RLS de activities)
-- ------------------------------------------------------------
create or replace function public.snapshot_itinerary(p_trip_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(
    (to_jsonb(a) - 'trip_id' - 'day_id' - 'end_day_id' - 'day_orders')
    || jsonb_build_object(
      'date', d.date,
      'end_date', ed.date,
      'day_orders', coalesce((
        select jsonb_object_agg(od.date::text, o.value)
        from jsonb_each(a.day_orders) o
        join public.itinerary_days od on od.id::text = o.key
      ), '{}'::jsonb)
    )
    order by d.date, a.order_index
  ), '[]'::jsonb)
  from public.activities a
  join public.itinerary_days d on d.id = a.day_id
  left join public.itinerary_days ed on ed.id = a.end_day_id
  where a.trip_id = p_trip_id
$$;

-- ------------------------------------------------------------
-- Guardar el itinerario actual como versión
-- ------------------------------------------------------------
create or replace function public.save_itinerary_version(p_trip_id uuid, p_name text, p_source text default 'manual')
returns public.itinerary_versions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v public.itinerary_versions;
begin
  if not public.can_edit_trip(p_trip_id) then
    raise exception 'Sin permiso para editar este viaje' using errcode = '42501';
  end if;
  insert into public.itinerary_versions (trip_id, name, source, snapshot, created_by)
  values (p_trip_id, p_name, p_source, public.snapshot_itinerary(p_trip_id), auth.uid())
  returning * into v;
  return v;
end;
$$;

-- ------------------------------------------------------------
-- Restaurar una versión, todo o nada
-- ------------------------------------------------------------
-- 1. Guarda antes el itinerario actual como versión 'auto' (red de seguridad).
-- 2. Actualiza las actividades que siguen existiendo y reinserta, con su mismo
--    id, las que se borraron después de la foto.
-- 3. Borra las creadas después de la foto.
-- 'done' no se toca: marcar algo como hecho no es parte de la organización.
-- Si alguna fecha de la foto ya no existe en el viaje (se cambiaron las
-- fechas), no se toca nada y se avisa: restaurar a medias sería peor.
create or replace function public.restore_itinerary_version(p_version_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v public.itinerary_versions;
  v_missing text[];
  v_backup uuid;
  v_deleted int;
  v_upserted int;
begin
  select * into v from public.itinerary_versions where id = p_version_id;
  if not found then
    raise exception 'Versión no encontrada' using errcode = 'P0002';
  end if;
  if not public.can_edit_trip(v.trip_id) then
    raise exception 'Sin permiso para editar este viaje' using errcode = '42501';
  end if;

  drop table if exists pg_temp.tmp_snap;
  create temp table tmp_snap on commit drop as
    select
      s.elem,
      (s.elem->>'id')::uuid as id,
      s.elem->>'date' as date,
      d.id as day_id,
      ed.id as end_day_id,
      (s.elem->>'end_date') is not null and ed.id is null as end_missing
    from jsonb_array_elements(v.snapshot) s(elem)
    left join public.itinerary_days d on d.trip_id = v.trip_id and d.date = (s.elem->>'date')::date
    left join public.itinerary_days ed on ed.trip_id = v.trip_id and ed.date = (s.elem->>'end_date')::date;

  select array_agg(distinct date order by date) into v_missing
  from tmp_snap where day_id is null or end_missing;
  if v_missing is not null then
    raise exception 'La versión tiene días que ya no están en el viaje: %', array_to_string(v_missing, ', ')
      using errcode = 'P0001';
  end if;

  insert into public.itinerary_versions (trip_id, name, source, snapshot, created_by)
  values (v.trip_id, 'Antes de restaurar «' || v.name || '»', 'auto', public.snapshot_itinerary(v.trip_id), auth.uid())
  returning id into v_backup;

  delete from public.activities a
  where a.trip_id = v.trip_id and not exists (select 1 from tmp_snap t where t.id = a.id);
  get diagnostics v_deleted = row_count;

  insert into public.activities (
    id, trip_id, day_id, end_day_id, type, title, description, address, start_time, end_time,
    price, external_link, notes, order_index, place_id, origin, destination, lat, lng,
    origin_lat, origin_lng, destination_lat, destination_lng, cover_image_url, day_orders,
    done, origin_tz, destination_tz, fixed_time, created_at
  )
  select
    t.id, v.trip_id, t.day_id, t.end_day_id, r.type, r.title, r.description, r.address, r.start_time, r.end_time,
    r.price, r.external_link, r.notes, r.order_index, r.place_id, r.origin, r.destination, r.lat, r.lng,
    r.origin_lat, r.origin_lng, r.destination_lat, r.destination_lng, r.cover_image_url,
    coalesce((
      select jsonb_object_agg(od.id::text, o.value)
      from jsonb_each(t.elem->'day_orders') o
      join public.itinerary_days od on od.trip_id = v.trip_id and od.date::text = o.key
    ), '{}'::jsonb),
    coalesce(r.done, false), r.origin_tz, r.destination_tz, coalesce(r.fixed_time, false), coalesce(r.created_at, now())
  from tmp_snap t
  cross join lateral jsonb_populate_record(null::public.activities, t.elem) r
  on conflict (id) do update set
    day_id = excluded.day_id, end_day_id = excluded.end_day_id, type = excluded.type, title = excluded.title,
    description = excluded.description, address = excluded.address, start_time = excluded.start_time,
    end_time = excluded.end_time, price = excluded.price, external_link = excluded.external_link,
    notes = excluded.notes, order_index = excluded.order_index, place_id = excluded.place_id,
    origin = excluded.origin, destination = excluded.destination, lat = excluded.lat, lng = excluded.lng,
    origin_lat = excluded.origin_lat, origin_lng = excluded.origin_lng, destination_lat = excluded.destination_lat,
    destination_lng = excluded.destination_lng, cover_image_url = excluded.cover_image_url,
    day_orders = excluded.day_orders, origin_tz = excluded.origin_tz, destination_tz = excluded.destination_tz,
    fixed_time = excluded.fixed_time;
  get diagnostics v_upserted = row_count;

  return jsonb_build_object('backup_id', v_backup, 'deleted', v_deleted, 'upserted', v_upserted);
end;
$$;

grant execute on function public.snapshot_itinerary(uuid) to authenticated;
grant execute on function public.save_itinerary_version(uuid, text, text) to authenticated;
grant execute on function public.restore_itinerary_version(uuid) to authenticated;
