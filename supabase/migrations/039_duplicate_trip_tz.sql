-- ============================================================
-- WANDERLOG - duplicate_trip() copia también los husos horarios
-- ============================================================
-- Copia literal de 032_duplicate_trip.sql con las tres columnas que añadió 038
-- (activities.origin_tz / destination_tz e itinerary_days.tz).
--
-- La función inserta con lista de columnas EXPLÍCITA, así que sin esto duplicar
-- un viaje perdería los husos: el backfill los volvería a resolver, pero es una
-- regresión gratis. Recordatorio para la próxima columna que se añada a
-- activities o a itinerary_days: hay que tocar esta función también.
create or replace function public.duplicate_trip(p_trip_id uuid)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src public.trips;
  v_new public.trips;
  v_guide record;
  v_day record;
  v_act record;
  v_new_day_orders jsonb;
begin
  if not public.has_trip_access(p_trip_id) then
    raise exception 'No tienes acceso a este viaje';
  end if;

  select * into v_src from public.trips where id = p_trip_id;
  if v_src.id is null then
    raise exception 'Viaje no encontrado';
  end if;

  create temporary table tmp_guide_map (old_id uuid primary key, new_id uuid) on commit drop;
  create temporary table tmp_day_map (old_id uuid primary key, new_id uuid) on commit drop;

  insert into public.trips (
    user_id, name, description, destination, start_date, end_date,
    cover_image_url, status, budget_total, tags, default_currency
  ) values (
    auth.uid(), 'Copia de ' || v_src.name, v_src.description, v_src.destination,
    v_src.start_date, v_src.end_date, v_src.cover_image_url, 'planning',
    v_src.budget_total, v_src.tags, v_src.default_currency
  )
  returning * into v_new;

  for v_guide in select * from public.destination_guides where trip_id = p_trip_id
  loop
    declare
      v_new_guide_id uuid;
    begin
      insert into public.destination_guides (
        trip_id, name, sections, cover_image_url, order_index, facts, imported_at
      ) values (
        v_new.id, v_guide.name, v_guide.sections, v_guide.cover_image_url,
        v_guide.order_index, v_guide.facts, v_guide.imported_at
      )
      returning id into v_new_guide_id;
      insert into tmp_guide_map values (v_guide.id, v_new_guide_id);
    end;
  end loop;

  for v_day in select * from public.itinerary_days where trip_id = p_trip_id order by date
  loop
    declare
      v_new_day_id uuid;
    begin
      insert into public.itinerary_days (trip_id, date, notes, guide_id, city, tz)
      values (
        v_new.id, v_day.date, v_day.notes,
        (select new_id from tmp_guide_map where old_id = v_day.guide_id),
        v_day.city, v_day.tz
      )
      returning id into v_new_day_id;
      insert into tmp_day_map values (v_day.id, v_new_day_id);
    end;
  end loop;

  for v_act in select * from public.activities where trip_id = p_trip_id order by order_index
  loop
    select coalesce(jsonb_object_agg(m.new_id::text, kv.value), '{}'::jsonb)
    into v_new_day_orders
    from jsonb_each(v_act.day_orders) kv
    join tmp_day_map m on m.old_id = kv.key::uuid;

    insert into public.activities (
      trip_id, day_id, end_day_id, type, title, description, address,
      start_time, end_time, price, external_link, notes, order_index,
      place_id, origin, destination, lat, lng, origin_lat, origin_lng,
      destination_lat, destination_lng, cover_image_url, day_orders, done,
      origin_tz, destination_tz
    ) values (
      v_new.id,
      (select new_id from tmp_day_map where old_id = v_act.day_id),
      (select new_id from tmp_day_map where old_id = v_act.end_day_id),
      v_act.type, v_act.title, v_act.description, v_act.address,
      v_act.start_time, v_act.end_time, v_act.price, v_act.external_link,
      v_act.notes, v_act.order_index, v_act.place_id, v_act.origin,
      v_act.destination, v_act.lat, v_act.lng, v_act.origin_lat, v_act.origin_lng,
      v_act.destination_lat, v_act.destination_lng, v_act.cover_image_url,
      coalesce(v_new_day_orders, '{}'::jsonb), false,
      v_act.origin_tz, v_act.destination_tz
    );
  end loop;

  return v_new;
end;
$$;

grant execute on function public.duplicate_trip(uuid) to authenticated;
