-- ============================================================
-- WANDERLOG - Quien solo "ve" el viaje también tacha lo hecho
-- ============================================================
-- Marcar una actividad como hecha es llevar la cuenta de lo que ya se ha
-- visitado, no editar el plan: quien viaja con permiso de "ver" tiene que
-- poder hacerlo. Desde 035 las políticas de UPDATE de activities exigen
-- can_edit_trip, así que a un viewer el update le afectaba 0 filas —sin
-- error— y el check se marcaba y se desmarcaba solo al refrescar.
--
-- RLS no distingue columnas, así que la excepción va por RPC: esta función
-- es lo ÚNICO que un viewer puede escribir en activities, y solo la
-- columna done.

create or replace function public.set_activity_done(p_activity_id uuid, p_done boolean)
returns public.activities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip uuid;
  v_row public.activities;
begin
  select trip_id into v_trip from public.activities where id = p_activity_id;
  if v_trip is null then
    raise exception 'Actividad no encontrada';
  end if;
  if not public.has_trip_access(v_trip) then
    raise exception 'No tienes acceso a este viaje';
  end if;

  update public.activities set done = p_done
  where id = p_activity_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.set_activity_done(uuid, boolean) to authenticated;
