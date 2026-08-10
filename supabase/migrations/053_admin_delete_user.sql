-- ============================================================
-- WANDERLOG - Borrar una cuenta y todo lo suyo
-- ============================================================
-- Aquí solo van las piezas SQL. El orden y la orquestación viven en la edge
-- function `admin-delete-user`, porque hacen falta cosas que Postgres no
-- puede: borrar de Storage y borrar de auth.users.
--
-- EL BUG QUE HAY QUE ARREGLAR ANTES DE PODER BORRAR A NADIE:
--
--   trip_collaborators.invited_by → profiles(id) ON DELETE CASCADE  (003, l.13)
--
-- Borrar a Ana ECHA DE VIAJES AJENOS a todas las personas que Ana invitó. Si
-- Ana era colaboradora del viaje de Bruno e invitó a Carla, borrar a Ana deja
-- a Carla fuera de un viaje que no tiene nada que ver con ella. Nadie lo
-- detectaría hasta recibir el correo de un tercero preguntando qué ha pasado.
--
-- Se arregla reasignando `invited_by` al dueño del viaje ANTES de borrar, que
-- además es la verdad: quien tiene a esa gente dentro de su viaje es él.

-- ------------------------------------------------------------
-- Reasignar las invitaciones que hizo esta persona en viajes ajenos
-- ------------------------------------------------------------
create or replace function public.admin_reassign_invites(p_user uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  update public.trip_collaborators c
     set invited_by = t.user_id
    from public.trips t
   where t.id = c.trip_id
     and c.invited_by = p_user
     -- En SUS viajes no hace falta: se borran enteros con la cascada.
     and t.user_id <> p_user;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.admin_reassign_invites(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Los ficheros de una persona
-- ------------------------------------------------------------
-- Storage NO cascadea: al borrar la cuenta, sus objetos se quedan huérfanos
-- bajo un prefijo `{uuid}/` de un usuario que ya no existe, imposibles de
-- reclamar y de auditar. Hay que listarlos y borrarlos a mano.
--
-- `storage.list()` devuelve un solo nivel y las rutas son `{uid}/{tripId}/…`,
-- así que haría falta un recorrido recursivo con paginación, frágil. Una
-- consulta a `storage.objects` lo resuelve de una vez.
create or replace function public.admin_user_storage_paths(p_user uuid)
returns table (bucket_id text, name text, bytes bigint)
language plpgsql
security definer
stable
set search_path = public, storage
as $$
begin
  perform public.admin_guard();
  return query
  select o.bucket_id, o.name, coalesce((o.metadata->>'size')::bigint, 0)
    from storage.objects o
   where o.bucket_id in ('trip-covers','documents','avatars','attachments','audioguides')
     and o.name like p_user::text || '/%';
end;
$$;

revoke all on function public.admin_user_storage_paths(uuid) from public, anon;
grant execute on function public.admin_user_storage_paths(uuid) to authenticated;

-- ------------------------------------------------------------
-- Previsualización: qué se va a llevar por delante
-- ------------------------------------------------------------
-- Un borrado es irreversible, así que el diálogo tiene que enseñar antes lo
-- que va a pasar, incluido lo que afecta a TERCEROS: los colaboradores que se
-- quedan sin acceso y los viajes ajenos donde participa.
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
    -- Viajes de OTROS donde participa. No se tocan, pero sus ficheros sí se
    -- borran (están bajo su prefijo), así que alguna portada se quedará vacía.
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
    ),
    'bytes', (
      select coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint from storage.objects o
       where o.bucket_id in ('trip-covers','documents','avatars','attachments','audioguides')
         and o.name like p_user::text || '/%'
    ),
    'visitas', (select count(*) from public.page_views where user_id = p_user),
    'eventos', (select count(*) from public.usage_events where user_id = p_user)
  ) into v;

  return v;
end;
$$;

revoke all on function public.admin_delete_user_preview(uuid) from public, anon;
grant execute on function public.admin_delete_user_preview(uuid) to authenticated;

-- ------------------------------------------------------------
-- Anonimizar la telemetría
-- ------------------------------------------------------------
-- Las visitas y los eventos NO se borran: se les quita el `user_id`. El
-- tráfico agregado del sitio no es de quien se va, y borrarlo falsearía todas
-- las series hacia atrás. Va ANTES del borrado para no dejar ni un instante
-- filas apuntando a un id que ya no existe.
create or replace function public.admin_anonymize_telemetry(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_vistas int; v_eventos int;
begin
  update public.page_views set user_id = null where user_id = p_user;
  get diagnostics v_vistas = row_count;
  update public.usage_events set user_id = null where user_id = p_user;
  get diagnostics v_eventos = row_count;
  return jsonb_build_object('visitas', v_vistas, 'eventos', v_eventos);
end;
$$;

revoke all on function public.admin_anonymize_telemetry(uuid) from public, anon, authenticated;
