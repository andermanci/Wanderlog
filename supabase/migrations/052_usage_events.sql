-- ============================================================
-- WANDERLOG - Eventos de uso
-- ============================================================
-- `page_views` dice quién ENTRA. Esto dice quién USA, que no es lo mismo:
-- treinta visitas a la pantalla de audioguías y cero audioguías generadas es
-- una historia muy distinta de tres visitas y tres audioguías.
--
-- Y sobre todo dice QUIÉN GASTA DINERO. Google TTS se factura por carácter y
-- Gemini por petición; sin esto, quitarle `can_use_ai` a alguien sería una
-- decisión a ciegas.
--
-- DÓNDE SE EMITE CADA EVENTO, que es la única decisión de diseño que importa:
--
--   · Trigger en la base   → cuando el evento es 1:1 con una fila que se
--     inserta. Imposible de falsificar, imposible de perder, y cero código de
--     cliente que mantener.
--   · Edge function        → cuando el coste ocurre en un servidor y el número
--     solo lo sabe el servidor (caracteres sintetizados, bytes descargados).
--   · Cliente              → solo cuando el hecho no deja huella en la base ni
--     pasa por ningún servidor. Es el único sitio donde existe.
--
-- Un usuario puede inflar SUS PROPIOS contadores desde el cliente (la política
-- es `user_id = auth.uid()`); no los de otro. Para métricas de producto eso es
-- aceptable. Para las de coste no, y por eso esas van en el servidor.

create table if not exists public.usage_events (
  id      uuid primary key default gen_random_uuid(),
  -- Sin claves foráneas, igual que page_views: al borrar una cuenta estas
  -- filas se anonimizan y el evento sobrevive al viaje que lo originó.
  user_id uuid,
  trip_id uuid,
  event   text not null,
  props   jsonb not null default '{}',
  source  text not null default 'web' check (source in ('web', 'edge', 'db')),
  at      timestamptz not null default now()
);

create index if not exists usage_events_at_idx on public.usage_events (at desc);
create index if not exists usage_events_event_at_idx on public.usage_events (event, at desc);
create index if not exists usage_events_user_idx
  on public.usage_events (user_id) where user_id is not null;

alter table public.usage_events enable row level security;

-- Escritura sí, y solo sobre uno mismo. LECTURA NO, ni siquiera la propia: al
-- usuario no le sirve de nada releerlos, y el panel los lee por RPC definer.
-- Así esta tabla no puede convertirse en un canal de lectura lateral.
drop policy if exists "usage_events_insert_self" on public.usage_events;
create policy "usage_events_insert_self" on public.usage_events
  for insert to authenticated with check (user_id = auth.uid());

-- ------------------------------------------------------------
-- Emisor interno
-- ------------------------------------------------------------
create or replace function public.log_usage(
  p_user uuid,
  p_trip uuid,
  p_event text,
  p_props jsonb default '{}'
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.usage_events (user_id, trip_id, event, props, source)
  values (p_user, p_trip, p_event, coalesce(p_props, '{}'::jsonb), 'db');
$$;

revoke all on function public.log_usage(uuid, uuid, text, jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Los triggers
-- ------------------------------------------------------------
-- EL BLOQUE DE EXCEPCIÓN NO ES PARANOIA. Un trigger AFTER corre en la MISMA
-- transacción que la escritura del usuario: si el insert en usage_events
-- fallara (una restricción, la tabla llena, lo que sea), abortaría el viaje
-- que la persona acaba de crear. Telemetría que rompe la acción del usuario es
-- exactamente lo que no puede pasar.
--
-- LA MÉTRICA SE PIERDE; EL VIAJE NO.
--
-- (Cada bloque crea un savepoint por fila. A este volumen es irrelevante, pero
-- conviene saberlo si algún día se instrumenta una tabla con inserciones
-- masivas.)

create or replace function public.tg_usage_trip_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.log_usage(new.user_id, new.id, 'trip.created',
      jsonb_build_object(
        'dias', (new.end_date - new.start_date) + 1,
        'estado', new.status,
        'conPresupuesto', new.budget_total is not null,
        'etiquetas', coalesce(array_length(new.tags, 1), 0)));
  exception when others then null;
  end;
  return null;
end; $$;

drop trigger if exists usage_trip_created on public.trips;
create trigger usage_trip_created after insert on public.trips
  for each row execute function public.tg_usage_trip_created();

create or replace function public.tg_usage_activity_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    -- auth.uid() y no el dueño del viaje: quien la añadió puede ser un
    -- colaborador, y es su uso lo que se está midiendo.
    perform public.log_usage(auth.uid(), new.trip_id, 'activity.created',
      jsonb_build_object(
        'tipo', new.type,
        'conCoords', new.lat is not null and new.lng is not null,
        'conHora', new.start_time is not null));
  exception when others then null;
  end;
  return null;
end; $$;

drop trigger if exists usage_activity_created on public.activities;
create trigger usage_activity_created after insert on public.activities
  for each row execute function public.tg_usage_activity_created();

create or replace function public.tg_usage_expense_added() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    -- Categoría y moneda, NUNCA el importe: para saber que se usan los gastos
    -- no hace falta saber cuánto se gasta nadie.
    perform public.log_usage(auth.uid(), new.trip_id, 'expense.added',
      jsonb_build_object('categoria', new.category, 'moneda', new.currency,
                         'origen', new.source));
  exception when others then null;
  end;
  return null;
end; $$;

drop trigger if exists usage_expense_added on public.expenses;
create trigger usage_expense_added after insert on public.expenses
  for each row execute function public.tg_usage_expense_added();

create or replace function public.tg_usage_document_uploaded() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.log_usage(auth.uid(), new.trip_id, 'document.uploaded',
      jsonb_build_object('tipo', new.category, 'conFichero', new.file_url is not null));
  exception when others then null;
  end;
  return null;
end; $$;

drop trigger if exists usage_document_uploaded on public.documents;
create trigger usage_document_uploaded after insert on public.documents
  for each row execute function public.tg_usage_document_uploaded();

create or replace function public.tg_usage_collaborator_invited() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.log_usage(new.invited_by, new.trip_id, 'collaborator.invited',
      jsonb_build_object('rol', new.role, 'yaTeniaCuenta', new.user_id is not null));
  exception when others then null;
  end;
  return null;
end; $$;

drop trigger if exists usage_collaborator_invited on public.trip_collaborators;
create trigger usage_collaborator_invited after insert on public.trip_collaborators
  for each row execute function public.tg_usage_collaborator_invited();

-- Aceptar una invitación es un UPDATE (accepted_at pasa de null a una fecha),
-- no un insert: por eso este va aparte y con la condición explícita.
create or replace function public.tg_usage_invite_accepted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.log_usage(new.user_id, new.trip_id, 'invite.accepted',
      jsonb_build_object('rol', new.role));
  exception when others then null;
  end;
  return null;
end; $$;

drop trigger if exists usage_invite_accepted on public.trip_collaborators;
create trigger usage_invite_accepted after update on public.trip_collaborators
  for each row
  when (old.accepted_at is null and new.accepted_at is not null)
  execute function public.tg_usage_invite_accepted();

-- NO hay evento `trip.duplicated`: duplicar un viaje es un INSERT normal en
-- `trips`, indistinguible de crear uno desde cero para el trigger. Añadir una
-- columna solo para poder distinguirlo sería ensuciar el modelo por una
-- métrica; con `trip.created` basta para lo que se quiere saber.

-- ------------------------------------------------------------
-- Lectura para el panel
-- ------------------------------------------------------------
-- Dos vistas del mismo dato, porque son dos preguntas distintas:
-- «¿qué se usa?» y «¿quién me está gastando la cuota?».

create or replace function public.admin_events(p_days int default 30)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_dias int := greatest(1, least(coalesce(p_days, 30), 365));
  v_desde timestamptz;
begin
  perform public.admin_guard();
  v_desde := now() - make_interval(days => v_dias);

  return jsonb_build_object(
    'dias', v_dias,
    'total', (select count(*) from public.usage_events where at >= v_desde),
    'personas', (
      select count(distinct user_id) from public.usage_events
       where at >= v_desde and user_id is not null
    ),
    'porEvento', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'evento', e, 'n', n, 'personas', p) order by n desc), '[]'::jsonb)
        from (
          select event e, count(*) n, count(distinct user_id) p
            from public.usage_events where at >= v_desde
           group by 1 order by n desc limit 30
        ) x
    ),
    'porDia', (
      select coalesce(jsonb_agg(jsonb_build_object('dia', d, 'n', n) order by d), '[]'::jsonb)
        from (
          select to_char(at at time zone 'Europe/Madrid', 'YYYY-MM-DD') d, count(*) n
            from public.usage_events where at >= v_desde group by 1
        ) y
    ),
    -- El apartado que de verdad importa: quién consume lo que se paga.
    -- `units` sale de props.caracteres cuando lo hay (TTS), y si no cuenta 1.
    'gastoIA', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'user_id', uid, 'email', em, 'usos', n, 'unidades', u) order by u desc), '[]'::jsonb)
        from (
          select ue.user_id uid,
                 (select p.email from public.profiles p where p.id = ue.user_id) em,
                 count(*) n,
                 sum(coalesce((ue.props->>'caracteres')::bigint, 1)) u
            from public.usage_events ue
           where ue.at >= v_desde
             and ue.event like 'ai.%'
             and ue.user_id is not null
           group by 1 order by u desc limit 10
        ) z
    ),
    'ultimo', (select max(at) from public.usage_events)
  );
end;
$$;

revoke all on function public.admin_events(int) from public, anon;
grant execute on function public.admin_events(int) to authenticated;
