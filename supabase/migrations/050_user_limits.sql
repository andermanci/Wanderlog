-- ============================================================
-- WANDERLOG - Permisos y límites por usuario
-- ============================================================
-- Qué puede hacer cada persona: crear viajes, cuántos, usar las funciones con
-- IA (que cuestan dinero de verdad: Google TTS y Gemini), compartir, y si
-- está suspendida.
--
-- SE APLICA EN LA BASE DE DATOS, NO EN LA INTERFAZ. Ocultar un botón no es un
-- permiso: cualquiera con la anon key y curl salta la interfaz entera. Aquí
-- las reglas viven en RLS, y la interfaz solo se adelanta para poder explicar
-- el motivo en vez de enseñar un 403 críptico.
--
-- ESTA ES LA MIGRACIÓN MÁS PELIGROSA DE TODO EL PANEL. Toca `can_edit_trip()`,
-- de la que dependen unas 40 políticas repartidas por 14 tablas (las genera
-- el bucle de 035). Un error aquí no rompe una pantalla: deja la plataforma
-- entera en solo lectura. La comprobación que importa después de aplicarla no
-- es "un suspendido no puede editar", es "UN USUARIO NORMAL SIGUE PUDIENDO".

-- ------------------------------------------------------------
-- La tabla
-- ------------------------------------------------------------
-- NO se crea fila al registrarse, y no es un olvido: NO HAY FILA = TODO
-- PERMITIDO. Así el trigger handle_new_user() no se toca, y un fallo creando
-- la fila no puede dejar a nadie sin poder usar la aplicación. El caso normal
-- —la inmensa mayoría de la gente— no ocupa ni una fila.
create table if not exists public.user_limits (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  can_create_trips boolean not null default true,
  max_trips        int,                       -- null = sin tope
  can_use_ai       boolean not null default true,
  can_share_trips  boolean not null default true,
  is_suspended     boolean not null default false,
  notes            text,                      -- por qué, para acordarse dentro de seis meses
  updated_at       timestamptz not null default now(),
  updated_by       uuid
);

alter table public.user_limits enable row level security;

-- Leer LO PROPIO sí, y a propósito. Sin esto la aplicación solo puede enseñar
-- "42501" y adivinar el motivo; con esto puede decir exactamente qué pasa
-- ("tu cuenta está suspendida", "has llegado al máximo de 3 viajes").
drop policy if exists "user_limits_select_own" on public.user_limits;
create policy "user_limits_select_own" on public.user_limits
  for select using (auth.uid() = user_id);
-- Sin INSERT/UPDATE/DELETE: solo las RPC de administración y service_role.

-- ------------------------------------------------------------
-- Los tres helpers
-- ------------------------------------------------------------
-- Todos con `coalesce(..., true)`: sin fila, permitido. Es la regla que hace
-- que esta migración no pueda romper a quien ya estaba usando la aplicación.

create or replace function public.is_suspended()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select l.is_suspended from public.user_limits l where l.user_id = auth.uid()),
    false);
$$;

create or replace function public.can_create_trips()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Sobre max_trips: la subconsulta corre con el snapshot de la sentencia, que
  -- NO incluye la fila que se está insertando, así que `count < max` significa
  -- exactamente "tenías menos de N antes de esta". Hay una carrera teórica con
  -- dos inserciones simultáneas; para el caso de uso no compensa un lock.
  select coalesce(
    (select l.can_create_trips
        and not l.is_suspended
        and (l.max_trips is null
             or (select count(*) from public.trips t where t.user_id = auth.uid()) < l.max_trips)
       from public.user_limits l where l.user_id = auth.uid()),
    true);
$$;

create or replace function public.can_share_limit()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select l.can_share_trips and not l.is_suspended
       from public.user_limits l where l.user_id = auth.uid()),
    true);
$$;

revoke all on function public.is_suspended() from public, anon;
revoke all on function public.can_create_trips() from public, anon;
revoke all on function public.can_share_limit() from public, anon;
grant execute on function public.is_suspended() to authenticated;
grant execute on function public.can_create_trips() to authenticated;
grant execute on function public.can_share_limit() to authenticated;

-- ------------------------------------------------------------
-- Dónde se aplica: la mínima superficie posible
-- ------------------------------------------------------------

-- Crear viajes.
alter policy "trips_insert_own" on public.trips
  with check (auth.uid() = user_id and public.can_create_trips());

-- Borrar el viaje propio no pasa por can_edit_trip: se toca aparte.
alter policy "trips_delete_own" on public.trips
  using (auth.uid() = user_id and not public.is_suspended());

-- La suspensión se aplica DENTRO de can_edit_trip, no en cada política. Son
-- ~40 políticas en 14 tablas las que pasan por esta función (migración 035):
-- tocarla una vez es tocarlas todas; tocar las políticas sería tocar cuarenta
-- y olvidarse de tres. El resto del cuerpo es idéntico al de 035.
create or replace function public.can_edit_trip(p_trip_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    not public.is_suspended()
    and (
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
    public.can_share_limit()
    and (
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
      )
    );
$$;

-- `has_trip_access()` NO SE TOCA, y es deliberado. Suspender no es borrar: si
-- cortara también la lectura, la persona no podría ni exportar lo suyo, y un
-- colaborador suspendido dejaría de ver viajes DE OTROS, que no han hecho
-- nada. Suspender tiene que ser la opción intermedia entre no hacer nada y
-- borrar; si destruye el acceso a los datos, deja de serlo.
--
-- Tampoco se tocan `reminders`, `push_subscriptions` ni `profiles`: son
-- ajustes personales, y bloquearlos hace que la suspensión parezca una avería
-- en vez de una decisión.

-- ------------------------------------------------------------
-- admin_users: se rehace para incluir los permisos
-- ------------------------------------------------------------
-- `create or replace` no puede cambiar el tipo de retorno: hay que borrarla.
drop function if exists public.admin_users(text, int, int, uuid);

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
    left join public.user_limits l on l.user_id = b.id
   order by b.created_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke all on function public.admin_users(text, int, int, uuid) from public, anon;
grant execute on function public.admin_users(text, int, int, uuid) to authenticated;

-- ------------------------------------------------------------
-- Cambiar los permisos de alguien
-- ------------------------------------------------------------
-- Un único punto de escritura, con auditoría dentro de la misma transacción:
-- si el cambio se aplica, la entrada del registro existe; si falla, no queda
-- ni una cosa ni la otra.
--
-- Los parámetros son todos opcionales y null significa "no lo toques", así
-- que el panel puede mandar solo lo que cambia sin arriesgarse a pisar el
-- resto con valores por defecto.
create or replace function public.admin_set_limits(
  p_user uuid,
  p_can_create_trips boolean default null,
  p_max_trips int default null,
  p_clear_max_trips boolean default false,
  p_can_use_ai boolean default null,
  p_can_share_trips boolean default null,
  p_is_suspended boolean default null,
  p_notes text default null
)
returns public.user_limits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_limits;
  v_antes public.user_limits;
begin
  perform public.admin_guard();

  if p_user is null then
    raise exception 'Falta el usuario';
  end if;

  -- Nadie puede cambiarse los permisos a sí mismo, ni siquiera un admin. No
  -- es desconfianza: es que el único error irreversible aquí es dejarse fuera.
  if p_user = auth.uid() then
    raise exception 'No puedes cambiar tus propios permisos' using errcode = '42501';
  end if;

  -- Un administrador no está sujeto a estos límites (sus políticas no los
  -- miran igual) y ponérselos daría una falsa sensación de control.
  if exists (select 1 from public.app_admins where user_id = p_user) then
    raise exception 'Esa persona administra la plataforma: quítale el admin primero' using errcode = '42501';
  end if;

  select * into v_antes from public.user_limits where user_id = p_user;

  insert into public.user_limits as l (
    user_id, can_create_trips, max_trips, can_use_ai, can_share_trips,
    is_suspended, notes, updated_by
  ) values (
    p_user,
    coalesce(p_can_create_trips, true),
    case when p_clear_max_trips then null else p_max_trips end,
    coalesce(p_can_use_ai, true),
    coalesce(p_can_share_trips, true),
    coalesce(p_is_suspended, false),
    p_notes,
    auth.uid()
  )
  on conflict (user_id) do update set
    can_create_trips = coalesce(p_can_create_trips, l.can_create_trips),
    max_trips        = case when p_clear_max_trips then null
                            else coalesce(p_max_trips, l.max_trips) end,
    can_use_ai       = coalesce(p_can_use_ai, l.can_use_ai),
    can_share_trips  = coalesce(p_can_share_trips, l.can_share_trips),
    is_suspended     = coalesce(p_is_suspended, l.is_suspended),
    notes            = coalesce(p_notes, l.notes),
    updated_at       = now(),
    updated_by       = auth.uid()
  returning * into v_row;

  perform public.admin_audit(
    case
      when p_is_suspended is true  and coalesce(v_antes.is_suspended, false) = false then 'user.suspend'
      when p_is_suspended is false and coalesce(v_antes.is_suspended, false) = true  then 'user.unsuspend'
      else 'user.limits'
    end,
    p_user, null,
    jsonb_build_object(
      'antes', case when v_antes.user_id is null then null else jsonb_build_object(
        'can_create_trips', v_antes.can_create_trips, 'max_trips', v_antes.max_trips,
        'can_use_ai', v_antes.can_use_ai, 'can_share_trips', v_antes.can_share_trips,
        'is_suspended', v_antes.is_suspended) end,
      'ahora', jsonb_build_object(
        'can_create_trips', v_row.can_create_trips, 'max_trips', v_row.max_trips,
        'can_use_ai', v_row.can_use_ai, 'can_share_trips', v_row.can_share_trips,
        'is_suspended', v_row.is_suspended)
    )
  );

  return v_row;
end;
$$;

revoke all on function public.admin_set_limits(uuid, boolean, int, boolean, boolean, boolean, boolean, text)
  from public, anon;
grant execute on function public.admin_set_limits(uuid, boolean, int, boolean, boolean, boolean, boolean, text)
  to authenticated;
