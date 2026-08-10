-- ============================================================
-- WANDERLOG - Lo que el administrador puede leer
-- ============================================================
-- RLS oculta al admin casi todo: `profiles` solo deja ver la fila propia y
-- `trips` solo los viajes en los que participas. Hay dos formas de abrirlo, y
-- la elegida NO es la corta.
--
-- POR QUÉ NO `or is_platform_admin()` EN LAS POLÍTICAS:
--
--   a) Una política SELECT devuelve la FILA ENTERA. No hay forma de redactar
--      columnas con RLS, y el requisito es enseñar el itinerario SIN las
--      descripciones, las notas ni el diario. Con políticas es imposible.
--
--   b) `useTrips()` hace `select('*')` SIN filtrar por usuario: se apoya
--      enteramente en RLS. Ampliar la política de `trips` haría que el
--      Dashboard, el Calendario, el buscador Cmd+K y el prefetch del login
--      del administrador empezaran a devolver los viajes de TODA la
--      plataforma, y el persister los escribiría en su localStorage durante
--      60 días. Un `or` de una línea convertido en fuga de datos en cuatro
--      sitios que nadie está mirando.
--
--   c) La política se evalúa para todo el mundo, no solo para el admin.
--
-- Con RPC, en cambio, lo que el admin ve está escrito literalmente en la
-- lista de columnas de cada función: se revisa de un vistazo y se ve en un diff.
--
-- TODAS EN plpgsql, NO en `language sql`. En una función SQL, un guard metido
-- en un CTE que nadie referencia lo elimina el planificador y la función se
-- queda sin comprobación. `perform public.admin_guard();` es una sentencia y
-- siempre se ejecuta.
--
-- Y todas paginadas. PostgREST corta a 1000 filas EN SILENCIO, también en las
-- RPC `returns table`, y devuelve cifras perfectamente plausibles.

-- ------------------------------------------------------------
-- admin_users: la lista de personas registradas
-- ------------------------------------------------------------
-- Los contadores salen de UN agregado por tabla (los CTE de abajo), no de
-- subconsultas correlacionadas: listar 200 usuarios no puede ser 200x5
-- consultas. Con el volumen actual son milisegundos. Cuando esto se quede
-- corto —del orden de 10^5 actividades— toca vista materializada refrescada
-- por pg_cron; hasta entonces, complicarlo es adelantar trabajo.
--
-- Nota: los permisos por usuario (user_limits) llegan en la migración 050,
-- que hace drop y vuelve a crear esta función con esas columnas añadidas.
-- `p_user` sirve para pedir UNA persona concreta con estos mismos contadores:
-- la ficha de detalle los necesita, y sin este parámetro tendría que buscarla
-- dentro de la primera página de la lista —donde no está si hay más de 50
-- usuarios, y entonces la ficha se queda cargando para siempre.
create or replace function public.admin_users(
  p_q text default null,
  p_limit int default 50,
  p_offset int default 0,
  p_user uuid default null
)
returns table (
  user_id uuid,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz,
  trips int,
  collaborations int,
  activities int,
  expenses int,
  documents int,
  storage_bytes bigint,
  is_admin boolean,
  total_count bigint
)
language plpgsql
security definer
stable
set search_path = public, storage
as $$
begin
  perform public.admin_guard();

  return query
  with
  tr as (
    select t.user_id uid, count(*)::int n from public.trips t group by 1
  ),
  ac as (
    select t.user_id uid, count(*)::int n
      from public.activities a join public.trips t on t.id = a.trip_id group by 1
  ),
  ex as (
    select t.user_id uid, count(*)::int n
      from public.expenses e join public.trips t on t.id = e.trip_id group by 1
  ),
  doc as (
    select t.user_id uid, count(*)::int n
      from public.documents d join public.trips t on t.id = d.trip_id group by 1
  ),
  col as (
    select c.user_id uid, count(*)::int n
      from public.trip_collaborators c where c.user_id is not null group by 1
  ),
  -- Los cinco buckets guardan bajo `{user_id}/...` (migraciones 001, 006, 027).
  -- El prefijo se compara como TEXTO, no casteando a uuid: una carpeta que no
  -- lo sea reventaría la consulta entera.
  st as (
    -- El cast a bigint es obligatorio: sum() sobre bigint devuelve numeric, y
    -- la firma de la función declara bigint. Sin él, la RPC falla en runtime
    -- con "structure of query does not match function result type".
    select split_part(o.name, '/', 1) uid_txt,
           sum(coalesce((o.metadata->>'size')::bigint, 0))::bigint bytes
      from storage.objects o
     where o.bucket_id in ('trip-covers','documents','avatars','attachments','audioguides')
     group by 1
  ),
  base as (
    select p.id, p.email, p.full_name, p.avatar_url, p.created_at
      from public.profiles p
     where (p_user is null or p.id = p_user)
       and (p_q is null
            or p_q = ''
            or p.email ilike '%' || p_q || '%'
            or coalesce(p.full_name, '') ilike '%' || p_q || '%')
  )
  select b.id, b.email, b.full_name, b.avatar_url, b.created_at,
         coalesce(tr.n, 0), coalesce(col.n, 0), coalesce(ac.n, 0),
         coalesce(ex.n, 0), coalesce(doc.n, 0), coalesce(st.bytes, 0),
         exists (select 1 from public.app_admins z where z.user_id = b.id),
         -- El total va en la MISMA respuesta: paginar sin segunda consulta.
         count(*) over ()
    from base b
    left join tr  on tr.uid = b.id
    left join ac  on ac.uid = b.id
    left join ex  on ex.uid = b.id
    left join doc on doc.uid = b.id
    left join col on col.uid = b.id
    left join st  on st.uid_txt = b.id::text
   order by b.created_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

-- La firma vieja (sin p_user) quedaría viva junto a la nueva y PostgREST
-- podría resolver hacia ella: se elimina explícitamente.
drop function if exists public.admin_users(text, int, int);
revoke all on function public.admin_users(text, int, int, uuid) from public, anon;
grant execute on function public.admin_users(text, int, int, uuid) to authenticated;

-- ------------------------------------------------------------
-- admin_user_trips: los viajes de una persona
-- ------------------------------------------------------------
-- FUERA a propósito: `description` (texto libre de quien lo escribió) y
-- `budget_total` (un importe). `cover_image_url` se colapsa a un booleano
-- porque el bucket `trip-covers` es público: devolver la URL sería devolver
-- la foto.
create or replace function public.admin_user_trips(p_user uuid)
returns table (
  trip_id uuid,
  name text,
  destination text,
  start_date date,
  end_date date,
  status text,
  created_at timestamptz,
  default_currency text,
  has_cover boolean,
  tags text[],
  is_owner boolean,
  role text,
  days int,
  activities int,
  expenses int,
  documents int,
  photos int,
  collaborators int
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  perform public.admin_guard();

  return query
  select t.id, t.name, t.destination, t.start_date, t.end_date, t.status,
         t.created_at, t.default_currency,
         t.cover_image_url is not null,
         t.tags,
         t.user_id = p_user,
         case when t.user_id = p_user then 'owner' else c.role end,
         (select count(*)::int from public.itinerary_days d where d.trip_id = t.id),
         (select count(*)::int from public.activities a where a.trip_id = t.id),
         (select count(*)::int from public.expenses e where e.trip_id = t.id),
         (select count(*)::int from public.documents x where x.trip_id = t.id),
         (select count(*)::int from public.journal_photos j where j.trip_id = t.id),
         (select count(*)::int from public.trip_collaborators k where k.trip_id = t.id)
    from public.trips t
    left join public.trip_collaborators c
           on c.trip_id = t.id and c.user_id = p_user
   where t.user_id = p_user or c.user_id = p_user
   order by t.start_date desc;
end;
$$;

revoke all on function public.admin_user_trips(uuid) from public, anon;
grant execute on function public.admin_user_trips(uuid) to authenticated;

-- ------------------------------------------------------------
-- admin_trips: todos los viajes de la plataforma
-- ------------------------------------------------------------
create or replace function public.admin_trips(
  p_q text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  trip_id uuid,
  name text,
  destination text,
  start_date date,
  end_date date,
  status text,
  created_at timestamptz,
  owner_id uuid,
  owner_email text,
  activities int,
  collaborators int,
  total_count bigint
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  perform public.admin_guard();

  return query
  with
  ac as (select a.trip_id tid, count(*)::int n from public.activities a group by 1),
  co as (select c.trip_id tid, count(*)::int n from public.trip_collaborators c group by 1),
  base as (
    select t.id, t.name, t.destination, t.start_date, t.end_date, t.status,
           t.created_at, t.user_id, p.email
      from public.trips t
      left join public.profiles p on p.id = t.user_id
     where p_q is null
        or p_q = ''
        or t.name ilike '%' || p_q || '%'
        or t.destination ilike '%' || p_q || '%'
        or coalesce(p.email, '') ilike '%' || p_q || '%'
  )
  select b.id, b.name, b.destination, b.start_date, b.end_date, b.status,
         b.created_at, b.user_id, b.email,
         coalesce(ac.n, 0), coalesce(co.n, 0),
         count(*) over ()
    from base b
    left join ac on ac.tid = b.id
    left join co on co.tid = b.id
   order by b.created_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke all on function public.admin_trips(text, int, int) from public, anon;
grant execute on function public.admin_trips(text, int, int) to authenticated;

-- ------------------------------------------------------------
-- admin_trip_overview: la ficha de un viaje
-- ------------------------------------------------------------
-- De los gastos salen CUÁNTOS, en qué categorías y en qué monedas. Nunca un
-- importe, ni siquiera el total: el presupuesto de alguien no hace falta para
-- administrar nada. Del diario, CUÁNTOS días tienen entrada; nunca el texto.
create or replace function public.admin_trip_overview(p_trip uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, storage
as $$
declare
  v jsonb;
begin
  perform public.admin_guard();

  select jsonb_build_object(
    'trip_id', t.id,
    'name', t.name,
    'destination', t.destination,
    'start_date', t.start_date,
    'end_date', t.end_date,
    'status', t.status,
    'created_at', t.created_at,
    'default_currency', t.default_currency,
    'tags', to_jsonb(t.tags),
    'has_cover', t.cover_image_url is not null,
    'owner_id', t.user_id,
    'owner_email', (select p.email from public.profiles p where p.id = t.user_id),
    'days', (select count(*) from public.itinerary_days d where d.trip_id = t.id),
    'activities', (select count(*) from public.activities a where a.trip_id = t.id),
    'activities_done', (select count(*) from public.activities a where a.trip_id = t.id and a.done),
    'expenses', (select count(*) from public.expenses e where e.trip_id = t.id),
    'expense_categories', (
      select coalesce(jsonb_agg(distinct e.category), '[]'::jsonb)
        from public.expenses e where e.trip_id = t.id
    ),
    'expense_currencies', (
      select coalesce(jsonb_agg(distinct e.currency), '[]'::jsonb)
        from public.expenses e where e.trip_id = t.id
    ),
    'documents', (select count(*) from public.documents x where x.trip_id = t.id),
    'photos', (select count(*) from public.journal_photos j where j.trip_id = t.id),
    'travelers', (select count(*) from public.travelers v where v.trip_id = t.id),
    'places', (select count(*) from public.favorite_places f where f.trip_id = t.id),
    'guides', (select count(*) from public.destination_guides g where g.trip_id = t.id),
    'audioguides', (select count(*) from public.audioguides ag where ag.trip_id = t.id),
    'audio_stops_ready', (
      select count(*) from public.audioguide_stops s
       where s.trip_id = t.id and s.audio_url is not null
    ),
    'journal_days', (
      select count(*) from public.itinerary_days d
       where d.trip_id = t.id and d.journal is not null and length(trim(d.journal)) > 0
    ),
    'collaborators', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'email', c.email, 'role', c.role, 'accepted', c.accepted_at is not null)
               order by c.created_at), '[]'::jsonb)
        from public.trip_collaborators c where c.trip_id = t.id
    ),
    'storage_bytes', (
      select coalesce(sum((o.metadata->>'size')::bigint), 0)
        from storage.objects o
       where o.bucket_id in ('trip-covers','documents','attachments','audioguides')
         and split_part(o.name, '/', 2) = t.id::text
    )
  )
  into v
  from public.trips t
  where t.id = p_trip;

  return v;   -- null si el viaje no existe: el cliente lo trata como 404
end;
$$;

revoke all on function public.admin_trip_overview(uuid) from public, anon;
grant execute on function public.admin_trip_overview(uuid) to authenticated;

-- ------------------------------------------------------------
-- admin_trip_itinerary: el itinerario REDACTADO
-- ------------------------------------------------------------
-- Esta lista de columnas ES la política de privacidad del panel. Lo que no
-- esté aquí, el administrador no lo ve.
--
--   SÍ:  título (recortado), tipo, horas, dirección, hecha, orden, la fecha
--        del día, cuántas ciudades tiene y si hay diario.
--   NO:  description, notes, journal, lat/lng, external_link, origin,
--        destination, cover_image_url, place_id, precio.
--
-- Del diario y de las notas sale CUÁNTO se escribió, nunca QUÉ. Saber que un
-- día tiene 2.000 caracteres de diario sirve para diagnosticar; leerlos, no.
create or replace function public.admin_trip_itinerary(p_trip uuid)
returns table (
  day_id uuid,
  day_date date,
  day_cities int,
  has_journal boolean,
  journal_chars int,
  notes_chars int,
  activity_id uuid,
  activity_type text,
  title text,
  address text,
  start_time time,
  end_time time,
  has_coords boolean,
  has_cover boolean,
  attachments int,
  done boolean,
  order_index int
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  perform public.admin_guard();

  return query
  select d.id, d.date,
         coalesce(jsonb_array_length(d.cities), 0),
         d.journal is not null and length(trim(d.journal)) > 0,
         coalesce(length(d.journal), 0),
         coalesce(length(d.notes), 0),
         a.id, a.type,
         -- Recortado a 80: sin esto, el título se convierte en el sitio donde
         -- alguien mete el texto libre que las demás columnas no muestran.
         left(a.title, 80),
         a.address,
         a.start_time, a.end_time,
         a.lat is not null and a.lng is not null,
         a.cover_image_url is not null,
         (select count(*)::int from public.activity_attachments t where t.activity_id = a.id),
         a.done, a.order_index
    from public.itinerary_days d
    left join public.activities a on a.day_id = d.id
   where d.trip_id = p_trip
   order by d.date, a.order_index nulls last;
end;
$$;

revoke all on function public.admin_trip_itinerary(uuid) from public, anon;
grant execute on function public.admin_trip_itinerary(uuid) to authenticated;

-- ------------------------------------------------------------
-- admin_metrics: las cifras de la plataforma
-- ------------------------------------------------------------
-- Un solo jsonb y no `returns table` porque son escalares heterogéneos: con
-- una tabla, el panel montaría veinte columnas de una fila.
create or replace function public.admin_metrics(p_days int default 30)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, storage
as $$
declare
  v_desde timestamptz;
  v_dias int := greatest(1, least(coalesce(p_days, 30), 365));
begin
  perform public.admin_guard();
  v_desde := now() - make_interval(days => v_dias);

  return jsonb_build_object(
    'dias', v_dias,
    'usuarios', (select count(*) from public.profiles),
    'usuarios_nuevos', (select count(*) from public.profiles where created_at >= v_desde),
    'usuarios_con_viaje', (select count(distinct user_id) from public.trips),
    'viajes', (select count(*) from public.trips),
    'viajes_nuevos', (select count(*) from public.trips where created_at >= v_desde),
    'viajes_por_estado', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
        from (select status, count(*) n from public.trips group by 1) s
    ),
    'altas_por_semana', (
      select coalesce(jsonb_agg(jsonb_build_object('semana', semana, 'n', n) order by semana), '[]'::jsonb)
        from (
          select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') semana, count(*) n
            from public.profiles where created_at >= v_desde group by 1
        ) w
    ),
    'actividades', (select count(*) from public.activities),
    'gastos', (select count(*) from public.expenses),
    'documentos', (select count(*) from public.documents),
    'fotos', (select count(*) from public.journal_photos),
    'audioguias', (select count(*) from public.audioguides),
    'colaboraciones', (select count(*) from public.trip_collaborators),
    'invitaciones_pendientes', (
      select count(*) from public.trip_collaborators where accepted_at is null
    ),
    'top_destinos', (
      select coalesce(jsonb_agg(jsonb_build_object('destino', destination, 'n', n) order by n desc), '[]'::jsonb)
        from (
          select destination, count(*) n from public.trips
           group by 1 order by n desc limit 10
        ) d
    ),
    'almacenamiento', (
      select coalesce(jsonb_object_agg(bucket_id, bytes), '{}'::jsonb)
        from (
          select o.bucket_id, sum(coalesce((o.metadata->>'size')::bigint, 0)) bytes
            from storage.objects o group by 1
        ) b
    )
  );
end;
$$;

revoke all on function public.admin_metrics(int) from public, anon;
grant execute on function public.admin_metrics(int) to authenticated;
