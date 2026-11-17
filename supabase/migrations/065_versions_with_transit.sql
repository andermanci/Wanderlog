-- ============================================================
-- WANDERLOG - Las versiones guardan también el transporte público
-- ============================================================
-- Una versión era solo la foto de las actividades. Ahora lleva además las
-- rutas en transporte público de sus trayectos (transit_routes), para poder
-- compararlas entre versiones y recuperarlas al volver a una.
--
-- `transit` es null en las versiones anteriores a esta migración (y en las
-- propuestas que no hablan de transporte): "no sé nada de trayectos". Al
-- restaurar una de esas, las rutas actuales no se tocan. Con un array (aunque
-- esté vacío), las rutas del viaje se sustituyen por las de la versión.
--
-- Cada elemento es una fila de transit_routes sin id ni trip_id. Las
-- actividades conservan su id entre versiones, así que from/to siguen valiendo.

alter table public.itinerary_versions add column if not exists transit jsonb;

create or replace function public.snapshot_transit(p_trip_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(r) - 'id' - 'trip_id' order by r.generated_at, r.id), '[]'::jsonb)
  from public.transit_routes r
  where r.trip_id = p_trip_id
$$;

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
  insert into public.itinerary_versions (trip_id, name, source, snapshot, transit, created_by)
  values (p_trip_id, p_name, p_source, public.snapshot_itinerary(p_trip_id), public.snapshot_transit(p_trip_id), auth.uid())
  returning * into v;
  return v;
end;
$$;

-- Igual que en 061, más los trayectos: la copia de seguridad los incluye y, si
-- la versión los trae, sustituyen a los del viaje (solo los que unen
-- actividades que existen tras restaurar).
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
  v_transit int := null;
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

  insert into public.itinerary_versions (trip_id, name, source, snapshot, transit, created_by)
  values (v.trip_id, 'Antes de restaurar «' || v.name || '»', 'auto',
          public.snapshot_itinerary(v.trip_id), public.snapshot_transit(v.trip_id), auth.uid())
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

  if v.transit is not null then
    delete from public.transit_routes where trip_id = v.trip_id;
    insert into public.transit_routes (
      trip_id, from_activity_id, to_activity_id, coords_sig, worth_it, total_minutes,
      summary, fare_text, note, steps, generated_at, skip_reason, alternative
    )
    select
      v.trip_id, r.from_activity_id, r.to_activity_id, r.coords_sig, r.worth_it, r.total_minutes,
      r.summary, r.fare_text, r.note, coalesce(r.steps, '[]'::jsonb), coalesce(r.generated_at, now()),
      r.skip_reason, r.alternative
    from jsonb_array_elements(v.transit) e
    cross join lateral jsonb_populate_record(null::public.transit_routes, e) r
    join public.activities fa on fa.id = r.from_activity_id and fa.trip_id = v.trip_id
    join public.activities ta on ta.id = r.to_activity_id and ta.trip_id = v.trip_id
    on conflict (from_activity_id, to_activity_id) do nothing;
    get diagnostics v_transit = row_count;
  end if;

  return jsonb_build_object('backup_id', v_backup, 'deleted', v_deleted, 'upserted', v_upserted, 'transit', v_transit);
end;
$$;

grant execute on function public.snapshot_transit(uuid) to authenticated;
