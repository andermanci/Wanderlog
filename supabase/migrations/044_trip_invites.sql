-- ============================================================
-- WANDERLOG - Invitaciones con enlace propio (para poder avisar por correo)
-- ============================================================
-- Hasta ahora compartir era silencioso: se creaba la fila en
-- trip_collaborators y la persona invitada tenía que enterarse por otro
-- canal y registrarse ella sola con ese mismo correo.
--
-- Cada invitación pasa a tener un token. Con él se puede:
--   · mandar un correo (o un enlace por WhatsApp) que lleva a /invite/<token>
--   · enseñar la ficha del viaje SIN sesión (invite_preview), que es lo que
--     convence de crear la cuenta
--   · unirse aunque se entre con OTRA cuenta distinta a la invitada
--     (accept_invite vincula user_id), caso muy común: te invitan al correo
--     del trabajo pero entras con tu Gmail.

-- ------------------------------------------------------------
-- Columnas de invitación
-- ------------------------------------------------------------
-- El token va como uuid sin guiones (32 hex): gen_random_uuid() es del core
-- de Postgres, mientras que gen_random_bytes() vive en pgcrypto, que aquí
-- está en el esquema `extensions` y no en el search_path de las migraciones.
alter table public.trip_collaborators
  add column if not exists invite_token text not null
    default replace(gen_random_uuid()::text, '-', ''),
  add column if not exists invite_sent_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists invite_expires_at timestamptz not null default now() + interval '30 days';

create unique index if not exists idx_trip_collaborators_token
  on public.trip_collaborators(invite_token);

-- Quien ya estaba dentro no tiene nada que aceptar.
update public.trip_collaborators
   set accepted_at = created_at
 where user_id is not null and accepted_at is null;

-- ------------------------------------------------------------
-- FUNCIÓN: invite_preview(token)
-- Única lectura sin sesión de la app: por eso va por RPC y no por RLS.
-- Devuelve solo lo justo para pintar la invitación (nada de itinerario,
-- gastos ni documentos).
-- ------------------------------------------------------------
create or replace function public.invite_preview(p_token text)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  c public.trip_collaborators;
  t public.trips;
  v_inviter text;
  v_status text;
begin
  select * into c from public.trip_collaborators where invite_token = p_token;
  if c.id is null then
    return json_build_object('status', 'invalid');
  end if;

  select * into t from public.trips where id = c.trip_id;
  if t.id is null then
    return json_build_object('status', 'invalid');
  end if;

  select coalesce(nullif(p.full_name, ''), p.email) into v_inviter
    from public.profiles p where p.id = c.invited_by;

  v_status := case
    when c.accepted_at is not null then 'accepted'
    when c.invite_expires_at < now() then 'expired'
    else 'pending'
  end;

  return json_build_object(
    'status', v_status,
    'trip_id', t.id,
    'trip_name', t.name,
    'destination', t.destination,
    'start_date', t.start_date,
    'end_date', t.end_date,
    'cover_image_url', t.cover_image_url,
    'inviter_name', v_inviter,
    'invited_email', c.email,
    'role', c.role
  );
end;
$$;

grant execute on function public.invite_preview(text) to anon, authenticated;

-- ------------------------------------------------------------
-- FUNCIÓN: accept_invite(token)
-- Vincula la invitación a quien la abre (sea cual sea su correo) y
-- devuelve el viaje al que entra.
-- ------------------------------------------------------------
create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.trip_collaborators;
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Necesitas iniciar sesión';
  end if;

  select * into c from public.trip_collaborators where invite_token = p_token;
  if c.id is null then
    raise exception 'Esta invitación no es válida';
  end if;

  -- Ya dentro del viaje (dueño, o colaborador por otra vía): no hay nada
  -- que aceptar, pero tampoco es un error: se le lleva al viaje.
  select user_id into v_owner from public.trips where id = c.trip_id;
  if v_owner = auth.uid() then
    return c.trip_id;
  end if;
  if exists (
    select 1 from public.trip_collaborators o
    where o.trip_id = c.trip_id and o.user_id = auth.uid()
  ) then
    return c.trip_id;
  end if;

  if c.accepted_at is not null then
    raise exception 'Esta invitación ya se ha usado';
  end if;
  if c.invite_expires_at < now() then
    raise exception 'Esta invitación ha caducado';
  end if;

  -- Se conserva el correo al que se invitó (es lo que ve quien invitó en
  -- su lista); el acceso pasa a resolverse por user_id, que es lo que ya
  -- miran has_trip_access / can_edit_trip / my_trip_role.
  update public.trip_collaborators
     set user_id = auth.uid(), accepted_at = now()
   where id = c.id;

  return c.trip_id;
end;
$$;

grant execute on function public.accept_invite(text) to authenticated;

-- ------------------------------------------------------------
-- share_trip: igual que en 035, pero al reinvitar a alguien que sigue
-- pendiente se le renueva la caducidad (si no, reinvitar a los 40 días
-- daría un enlace ya muerto).
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
    do update set
      user_id = coalesce(excluded.user_id, public.trip_collaborators.user_id),
      invite_expires_at = case
        when public.trip_collaborators.accepted_at is null
          then now() + interval '30 days'
        else public.trip_collaborators.invite_expires_at
      end
  returning * into v_row;

  return v_row;
end;
$$;

-- ------------------------------------------------------------
-- El trigger de alta de usuario (036) reclamaba las invitaciones
-- pendientes por correo: ahora marca también accepted_at, para que ese
-- token no se quede vivo después.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url);

  update public.trip_collaborators
     set user_id = new.id,
         accepted_at = coalesce(accepted_at, now())
   where user_id is null
     and lower(email) = lower(new.email);

  return new;
end;
$$;
