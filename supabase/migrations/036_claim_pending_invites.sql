-- ============================================================
-- WANDERLOG - Las invitaciones "pendientes" se reclaman al registrarse
-- ============================================================
-- Al invitar a un correo sin cuenta, trip_collaborators.user_id queda
-- null y la UI muestra "pendiente". Nada lo rellenaba cuando esa
-- persona se registraba después: el badge se quedaba así para siempre
-- (el acceso funcionaba igual, por coincidencia de email). Ahora el
-- alta de usuario reclama sus invitaciones, y se corrigen las de
-- quienes ya se registraron.

-- Alta de usuario: crea el perfil (como antes) y además vincula las
-- invitaciones pendientes dirigidas a su correo.
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
     set user_id = new.id
   where user_id is null
     and lower(email) = lower(new.email);

  return new;
end;
$$;

-- Backfill: invitados que ya se registraron pero siguen como "pendiente".
update public.trip_collaborators c
   set user_id = u.id
  from auth.users u
 where c.user_id is null
   and lower(c.email) = lower(u.email);
