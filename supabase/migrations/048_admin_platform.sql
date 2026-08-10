-- ============================================================
-- WANDERLOG - Administración de la plataforma
-- ============================================================
-- Hasta ahora no había ningún concepto de administrador global: los roles
-- (owner/admin/editor/viewer) son POR VIAJE. Esta migración añade el otro:
-- una lista de personas que pueden ver y administrar la plataforma entera.
--
-- No hay "roles" ni jerarquía. Hay una lista, y estás en ella o no estás.
-- Con una sola persona administrando, un sistema de roles sería andamiaje
-- para un edificio que no existe.
--
-- SEGURIDAD - las tres reglas que sostienen todo lo que viene detrás:
--
--   1. `app_admins` tiene RLS activo y CERO políticas. Para el rol
--      `authenticated` la tabla no existe: no se puede leer, ni escribir, ni
--      averiguar quién está dentro. Solo se toca por SQL o con service_role,
--      que salta RLS. Conceder admin es un acto deliberado con acceso al
--      panel de Supabase, nunca un botón de la aplicación.
--
--   2. Cada función lleva su `revoke ... from public, anon` INMEDIATAMENTE
--      detrás. Postgres concede EXECUTE a PUBLIC en toda función nueva, y el
--      rol `anon` usa una clave que está impresa en el bundle JavaScript que
--      sirve Netlify. Una función SECURITY DEFINER sin revocar es la
--      plataforma entera abierta a cualquiera con curl.
--
--   3. Toda función SECURITY DEFINER lleva `set search_path`. Sin él, quien
--      la llama puede anteponer un esquema propio y secuestrar los nombres
--      de tabla que la función usa.

-- ------------------------------------------------------------
-- La lista
-- ------------------------------------------------------------
create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;
-- Sin políticas a propósito. Ver la regla 1 de la cabecera.

-- ------------------------------------------------------------
-- ¿Soy admin?
-- ------------------------------------------------------------
-- SIN PARÁMETRO a propósito: una función `es_admin(uuid)` ejecutable por
-- cualquiera sería un enumerador de administradores, justo lo que la tabla
-- sin políticas evita. Solo puedes preguntar por ti.
create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.app_admins a where a.user_id = auth.uid());
$$;

revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- ------------------------------------------------------------
-- Guard para el resto de RPC de administración
-- ------------------------------------------------------------
-- Revocado a TODOS, `authenticated` incluido: solo lo llaman otras funciones
-- SECURITY DEFINER, que corren como el propietario y por tanto pueden.
--
-- 42501 = insufficient_privilege. PostgREST lo traduce a 403, y el cliente
-- ya distingue ese código.
create or replace function public.admin_guard()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.app_admins where user_id = auth.uid()) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.admin_guard() from public, anon, authenticated;

-- ------------------------------------------------------------
-- Registro de auditoría
-- ------------------------------------------------------------
-- Sin claves foráneas y con los emails COPIADOS, no referenciados: el sentido
-- de este registro es sobrevivir precisamente a los borrados que documenta.
-- Una FK a profiles haría que borrar a alguien se llevara por delante la
-- prueba de que lo borraste.
create table if not exists public.admin_audit_log (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid,
  admin_email  text,
  action       text not null,
  target_user  uuid,
  target_email text,
  target_trip  uuid,
  detail       jsonb not null default '{}',
  at           timestamptz not null default now()
);

create index if not exists admin_audit_at_idx on public.admin_audit_log (at desc);
create index if not exists admin_audit_target_idx
  on public.admin_audit_log (target_user) where target_user is not null;

alter table public.admin_audit_log enable row level security;
-- Sin políticas: se escribe desde funciones definer y se lee por RPC.

-- Escribe una entrada como el admin que está llamando.
create or replace function public.admin_audit(
  p_action text,
  p_target_user uuid default null,
  p_target_trip uuid default null,
  p_detail jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_audit_log
    (admin_id, admin_email, action, target_user, target_email, target_trip, detail)
  values (
    auth.uid(),
    (select p.email from public.profiles p where p.id = auth.uid()),
    p_action,
    p_target_user,
    (select p.email from public.profiles p where p.id = p_target_user),
    p_target_trip,
    coalesce(p_detail, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.admin_audit(text, uuid, uuid, jsonb) from public, anon, authenticated;

-- Variante para el service_role, que no tiene auth.uid(): el borrado de un
-- usuario corre en una edge function y necesita dejar rastro igualmente.
create or replace function public.admin_audit_service(
  p_admin uuid,
  p_action text,
  p_target_user uuid default null,
  p_target_trip uuid default null,
  p_detail jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_audit_log
    (admin_id, admin_email, action, target_user, target_email, target_trip, detail)
  values (
    p_admin,
    (select p.email from public.profiles p where p.id = p_admin),
    p_action,
    p_target_user,
    (select p.email from public.profiles p where p.id = p_target_user),
    p_target_trip,
    coalesce(p_detail, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.admin_audit_service(uuid, text, uuid, uuid, jsonb)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- Lectura del registro (paginada)
-- ------------------------------------------------------------
-- PostgREST corta las respuestas a 1000 filas EN SILENCIO, y eso vale
-- también para las RPC `returns table`. Ninguna consulta del panel puede
-- escribirse sin limit; el total viaja en la misma respuesta para poder
-- paginar sin una segunda consulta.
create or replace function public.admin_audit_list(
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  admin_email text,
  action text,
  target_user uuid,
  target_email text,
  target_trip uuid,
  detail jsonb,
  at timestamptz,
  total_count bigint
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  -- `perform` y no un CTE: en una función `language sql`, un guard metido en
  -- un CTE que nadie referencia lo elimina el planificador y la función se
  -- queda sin comprobación. En plpgsql esto es una sentencia y siempre corre.
  perform public.admin_guard();

  return query
  select l.id, l.admin_email, l.action, l.target_user, l.target_email,
         l.target_trip, l.detail, l.at,
         count(*) over ()
    from public.admin_audit_log l
   order by l.at desc
   limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke all on function public.admin_audit_list(int, int) from public, anon;
grant execute on function public.admin_audit_list(int, int) to authenticated;

-- ------------------------------------------------------------
-- Siembra del primer administrador
-- ------------------------------------------------------------
-- Con `raise warning` si la cuenta no existe todavía en este entorno. Un
-- `insert ... select` que no encuentra nada no falla: se queda callado, y
-- entonces la migración pasa en verde y nadie es admin. Este aviso es la
-- diferencia entre enterarse ahora y enterarse al no poder entrar.
do $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = 'andermanci6@gmail.com';

  if v_id is null then
    raise warning 'No existe andermanci6@gmail.com en auth.users: no se ha sembrado ningún administrador. Ejecuta el insert en app_admins cuando la cuenta exista.';
  else
    insert into public.app_admins (user_id) values (v_id) on conflict do nothing;
  end if;
end $$;
