-- ============================================================
-- WANDERLOG - Los audios de las audioguías se van a Cloudflare R2
-- ============================================================
-- Supabase avisó de que la organización se había pasado del gigabyte de
-- almacenamiento del plan gratuito: 1,13 GB, con periodo de gracia hasta el
-- 19 de septiembre de 2026. Los MP3 de las audioguías son lo único que crece
-- sin techo (32 kbps ≈ 240 KB por minuto de guion; una audioguía de museo pasa
-- de 7 MB), así que se mudan a R2, que da 10 GB y no cobra por salida de datos
-- —que en algo dedicado a servir audio es lo que decide—.
--
-- QUÉ CAMBIA EN LA BASE DE DATOS, que es poco: `audioguide_stops.audio_url`
-- pasa a guardar la CLAVE del objeto (`usuario/viaje/ámbito/parada.mp3`) en vez
-- de la URL pública completa. Quien la convierte en URL es el cliente, con
-- VITE_R2_PUBLIC_URL (src/lib/mediaUrl.ts). Guardar la URL entera es lo que
-- hizo cara esta mudanza; con la clave, cambiar de alojamiento es cambiar una
-- variable de entorno. La columna no cambia de tipo y no hace falta migrarla
-- aquí: lo hace el script scripts/migrar-audio-r2.ts, fila a fila y con vuelta
-- atrás, porque hay que copiar 1 GB de ficheros antes de tocar ninguna.
--
-- Durante la migración conviven filas con la URL vieja y filas con la clave
-- nueva. Es deliberado: mediaUrl() acepta las dos formas, así que no hay ningún
-- instante en que la app dependa de que la base de datos esté toda migrada.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 1. Cuánto ocupa cada audio
-- ------------------------------------------------------------
-- Al salir los ficheros de `storage.objects`, el panel de administración deja
-- de poder sumar bytes con una consulta al storage. La Edge Function conoce el
-- tamaño en el momento de subir, así que lo escribe aquí y las métricas siguen
-- cuadrando. El script de migración la retro-rellena para lo ya existente.
alter table public.audioguide_stops add column if not exists audio_bytes bigint;

comment on column public.audioguide_stops.audio_bytes is
  'Tamaño del MP3 en R2. Lo escribe audioguide-tts al subir; sustituye a la suma sobre storage.objects.';

comment on column public.audioguide_stops.audio_url is
  'Clave del objeto en R2 (usuario/viaje/ámbito/parada.mp3). Las filas sin migrar aún guardan la URL absoluta de Supabase; mediaUrl() acepta ambas.';

-- ------------------------------------------------------------
-- 2. Enumerar el bucket para el script de migración
-- ------------------------------------------------------------
-- `storage.objects` no lo expone PostgREST ni con la clave de servicio, y
-- storage.list() de supabase-js pagina de 100 en 100 —el mismo tope que ya
-- dejaba restos al borrar audioguías largas—. Esta función pagina por keyset,
-- que es exacto y no se salta nada.
--
-- ES TEMPORAL: la migración 060 la elimina cuando la mudanza haya terminado.
-- Solo la puede ejecutar service_role; ni anon ni authenticated la ven.
create or replace function public.migracion_audio_objetos(
  p_after text default '',
  p_limit int default 1000
)
returns table (name text, bytes bigint, mimetype text, created_at timestamptz)
language sql
security definer
stable
set search_path = public, storage
as $$
  select o.name,
         coalesce((o.metadata->>'size')::bigint, 0),
         o.metadata->>'mimetype',
         o.created_at
    from storage.objects o
   where o.bucket_id = 'audioguides'
     and o.name > coalesce(p_after, '')
   order by o.name
   limit greatest(1, least(coalesce(p_limit, 1000), 5000));
$$;

revoke all on function public.migracion_audio_objetos(text, int) from public, anon, authenticated;
grant execute on function public.migracion_audio_objetos(text, int) to service_role;

-- El reparto de TODO el almacenamiento, por bucket y por tipo de fichero. Es lo
-- que contesta la pregunta que decide si esta mudanza sirve de algo: ¿cuánto de
-- ese 1,13 GB es de verdad audio? Si resultara que no es la mayor parte, mover
-- los MP3 no bajaría del gigabyte y habría que replantear el alcance antes de
-- copiar nada. También temporal: la 060 se la lleva.
create or replace function public.migracion_storage_resumen()
returns table (bucket_id text, mimetype text, ficheros bigint, bytes bigint)
language sql
security definer
stable
set search_path = public, storage
as $$
  select o.bucket_id,
         coalesce(o.metadata->>'mimetype', 'desconocido'),
         count(*)::bigint,
         coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint
    from storage.objects o
   group by 1, 2
   order by 4 desc;
$$;

revoke all on function public.migracion_storage_resumen() from public, anon, authenticated;
grant execute on function public.migracion_storage_resumen() to service_role;

-- ------------------------------------------------------------
-- 3. Las métricas del panel vuelven a cuadrar
-- ------------------------------------------------------------
-- TRAMPA, y cuesta una tarde descubrirla: `admin_users` está definida en la
-- 049 y REDEFINIDA en la 050 (que le añadió las columnas de permisos). Editar
-- la de la 049 no tendría ningún efecto. Lo que sigue parte del cuerpo de la
-- 050, que es el que está vivo, y le añade el CTE `au`.
--
-- CAMBIO DE SEMÁNTICA QUE HAY QUE ASUMIR: `storage_bytes` pasa de significar
-- «bytes bajo el prefijo de esta persona» a «bytes de sus viajes» para la parte
-- de audio. En viajes compartidos las cifras se moverán. Es lo coherente con lo
-- que de verdad se borra al eliminar la cuenta: hoy, borrar a A destruía el
-- audio que A había generado en un viaje vivo de B, dejándole a B una
-- audioguía rota.
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
  can_create_trips boolean,
  max_trips int,
  can_use_ai boolean,
  can_share_trips boolean,
  is_suspended boolean,
  notes text,
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
  st as (
    -- El cast a bigint es obligatorio: sum() sobre bigint devuelve numeric.
    select split_part(o.name, '/', 1) uid_txt,
           sum(coalesce((o.metadata->>'size')::bigint, 0))::bigint bytes
      from storage.objects o
     where o.bucket_id in ('trip-covers','documents','avatars','attachments','audioguides')
     group by 1
  ),
  au as (
    -- El audio ya no está en storage.objects: se suma por los viajes de cada
    -- cual, que es además de quién se borra al eliminar la cuenta.
    select t.user_id uid, coalesce(sum(s.audio_bytes), 0)::bigint bytes
      from public.audioguide_stops s
      join public.trips t on t.id = s.trip_id
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
         coalesce(ex.n, 0), coalesce(doc.n, 0),
         coalesce(st.bytes, 0) + coalesce(au.bytes, 0),
         exists (select 1 from public.app_admins z where z.user_id = b.id),
         -- Sin fila en user_limits, todo permitido: los mismos coalesce que
         -- las funciones de arriba, para que el panel enseñe lo que de verdad
         -- va a pasar y no un estado inventado.
         coalesce(l.can_create_trips, true),
         l.max_trips,
         coalesce(l.can_use_ai, true),
         coalesce(l.can_share_trips, true),
         coalesce(l.is_suspended, false),
         l.notes,
         count(*) over ()
    from base b
    left join tr  on tr.uid = b.id
    left join ac  on ac.uid = b.id
    left join ex  on ex.uid = b.id
    left join doc on doc.uid = b.id
    left join col on col.uid = b.id
    left join st  on st.uid_txt = b.id::text
    left join au  on au.uid = b.id
    left join public.user_limits l on l.user_id = b.id
   order by b.created_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke all on function public.admin_users(text, int, int, uuid) from public, anon;
grant execute on function public.admin_users(text, int, int, uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. El resumen general: una clave nueva, y el panel se entera solo
-- ------------------------------------------------------------
-- AdminOverview suma Object.values() y recorre Object.entries() del objeto
-- `almacenamiento`, así que añadir aquí 'r2-audioguides' lo pinta sin tocar una
-- línea de React. Es además donde se ve, de un vistazo y sin salir de la app,
-- si el bucket de Supabase está bajando conforme avanza la migración.
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
    ) || jsonb_build_object(
      'r2-audioguides',
      (select coalesce(sum(audio_bytes), 0)::bigint from public.audioguide_stops)
    )
  );
end;
$$;

revoke all on function public.admin_metrics(int) from public, anon;
grant execute on function public.admin_metrics(int) to authenticated;

-- ------------------------------------------------------------
-- 5. La ficha del viaje
-- ------------------------------------------------------------
-- Mismo arreglo: `storage_bytes` sumaba por `split_part(name, '/', 2)`, que era
-- el id del viaje dentro de la ruta. El audio ya no pasa por ahí.
--
-- El bucket 'audioguides' se queda en la lista a propósito: sigue guardando las
-- imágenes WebP de las paradas, que NO se mudan (son 1,9 MB, y moverlas
-- obligaría a tocar el service worker y la caché de fotos para que siguieran
-- viéndose sin conexión dentro de un museo, que es justo para lo que existen).
create or replace function public.admin_trip_overview(p_trip uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, storage
as $$
declare v jsonb;
begin
  perform public.admin_guard();

  select jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'destination', t.destination,
    'start_date', t.start_date,
    'end_date', t.end_date,
    'status', t.status,
    'created_at', t.created_at,
    'owner', jsonb_build_object(
      'id', t.user_id,
      'email', (select p.email from public.profiles p where p.id = t.user_id),
      'full_name', (select p.full_name from public.profiles p where p.id = t.user_id)
    ),
    'days', (select count(*) from public.itinerary_days d where d.trip_id = t.id),
    'activities', (select count(*) from public.activities a where a.trip_id = t.id),
    'expenses', (select count(*) from public.expenses e where e.trip_id = t.id),
    'documents', (select count(*) from public.documents dd where dd.trip_id = t.id),
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
    ) + (
      select coalesce(sum(s.audio_bytes), 0)::bigint
        from public.audioguide_stops s where s.trip_id = t.id
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
-- 6. El aviso previo a borrar una cuenta
-- ------------------------------------------------------------
-- Este importa más de lo que parece: es el diálogo que se le enseña a quien
-- va a borrar a alguien, y si no cuenta el audio de R2 estaría diciendo que se
-- destruyen menos cosas de las que se destruyen.
--
-- `viajes_ajenos` cambia de sentido y por eso cambia su comentario: los
-- ficheros de audio que esta persona generó en viajes de otros YA NO se borran
-- con ella. Antes sí, porque colgaban de su prefijo, y eso dejaba al dueño del
-- viaje una audioguía rota sin haber hecho nada.
create or replace function public.admin_delete_user_preview(p_user uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, storage
as $$
declare v jsonb;
begin
  perform public.admin_guard();

  select jsonb_build_object(
    'user_id', p_user,
    'email', (select p.email from public.profiles p where p.id = p_user),
    'es_admin', exists (select 1 from public.app_admins a where a.user_id = p_user),
    'viajes_propios', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id, 'name', t.name, 'destination', t.destination,
               'colaboradores', (select count(*) from public.trip_collaborators c
                                  where c.trip_id = t.id))
               order by t.start_date), '[]'::jsonb)
        from public.trips t where t.user_id = p_user
    ),
    -- Gente que perderá el acceso a viajes de esta persona. Son las personas
    -- a las que hay que avisar, y por eso salen con nombre y apellidos.
    'colaboradores_afectados', (
      select coalesce(jsonb_agg(distinct c.email), '[]'::jsonb)
        from public.trip_collaborators c
        join public.trips t on t.id = c.trip_id
       where t.user_id = p_user and lower(c.email) <> lower(coalesce(
             (select p.email from public.profiles p where p.id = p_user), ''))
    ),
    -- Viajes de OTROS donde participa. No se tocan. Sus ficheros de storage sí
    -- se borran (están bajo su prefijo), así que alguna portada se quedará
    -- vacía; el AUDIO de esos viajes, en cambio, ya no: vive en R2 y se borra
    -- por viaje, no por quién lo generó.
    'viajes_ajenos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id, 'name', t.name,
               'owner', (select p.email from public.profiles p where p.id = t.user_id))), '[]'::jsonb)
        from public.trip_collaborators c
        join public.trips t on t.id = c.trip_id
       where c.user_id = p_user and t.user_id <> p_user
    ),
    'invitaciones_a_reasignar', (
      select count(*) from public.trip_collaborators c
        join public.trips t on t.id = c.trip_id
       where c.invited_by = p_user and t.user_id <> p_user
    ),
    'ficheros', (
      select count(*) from storage.objects o
       where o.bucket_id in ('trip-covers','documents','avatars','attachments','audioguides')
         and o.name like p_user::text || '/%'
    ) + (
      select count(*) from public.audioguide_stops s
        join public.trips t on t.id = s.trip_id
       where t.user_id = p_user and s.audio_url is not null
    ),
    'bytes', (
      select coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint from storage.objects o
       where o.bucket_id in ('trip-covers','documents','avatars','attachments','audioguides')
         and o.name like p_user::text || '/%'
    ) + (
      select coalesce(sum(s.audio_bytes), 0)::bigint
        from public.audioguide_stops s
        join public.trips t on t.id = s.trip_id
       where t.user_id = p_user
    ),
    'visitas', (select count(*) from public.page_views where user_id = p_user),
    'eventos', (select count(*) from public.usage_events where user_id = p_user)
  ) into v;

  return v;
end;
$$;

revoke all on function public.admin_delete_user_preview(uuid) from public, anon;
grant execute on function public.admin_delete_user_preview(uuid) to authenticated;
