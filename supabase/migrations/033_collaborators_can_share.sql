-- ============================================================
-- WANDERLOG - Los colaboradores también pueden compartir el viaje
-- ============================================================
-- Antes solo el propietario podía invitar. Ahora cualquier persona
-- con acceso al viaje (propietario o colaborador) puede invitar.
-- Quitar acceso: el propietario a cualquiera; un colaborador solo a
-- las invitaciones que hizo él, y a sí mismo (salir del viaje).

-- ------------------------------------------------------------
-- FUNCIÓN: share_trip — invita cualquiera con acceso al viaje
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
  if not public.has_trip_access(p_trip_id) then
    raise exception 'No tienes acceso a este viaje';
  end if;

  select email into v_self_email from auth.users where id = auth.uid();
  if lower(p_email) = lower(coalesce(v_self_email, '')) then
    raise exception 'No puedes compartir el viaje contigo mismo';
  end if;

  -- El propietario ya tiene acceso total: no se le añade como colaborador.
  if exists (select 1 from auth.users u where u.id = v_owner and lower(u.email) = lower(p_email)) then
    raise exception 'Esa persona es la propietaria del viaje';
  end if;

  select id into v_uid from auth.users where lower(email) = lower(p_email);

  insert into public.trip_collaborators (trip_id, email, user_id, invited_by)
  values (p_trip_id, lower(p_email), v_uid, auth.uid())
  on conflict (trip_id, email)
    do update set user_id = coalesce(excluded.user_id, public.trip_collaborators.user_id)
  returning * into v_row;

  return v_row;
end;
$$;

-- ------------------------------------------------------------
-- RLS: insertar (por si se usa la tabla directamente) y borrar
-- ------------------------------------------------------------
drop policy if exists "collab_insert" on public.trip_collaborators;
create policy "collab_insert" on public.trip_collaborators
  for insert with check (
    public.has_trip_access(trip_id) and invited_by = auth.uid()
  );

drop policy if exists "collab_delete" on public.trip_collaborators;
create policy "collab_delete" on public.trip_collaborators
  for delete using (
    -- el propietario quita a cualquiera
    exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
    -- el que invitó puede retirar su invitación
    or invited_by = auth.uid()
    -- cada uno puede salirse del viaje
    or user_id = auth.uid()
  );
