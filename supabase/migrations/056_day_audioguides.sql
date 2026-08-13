-- ============================================================
-- WANDERLOG - Audioguía de la ciudad del día
-- ============================================================
-- Hasta ahora una audioguía era siempre de UNA actividad: activity_id era
-- `not null unique`, así que el único sujeto posible era un sitio concreto del
-- itinerario (un museo, una iglesia). Pero el día tiene un sujeto propio que no
-- es ninguna de sus actividades: la ciudad. Un día en Venecia no es solo el
-- Palacio Ducal a las 10:00; es el paseo entre paradas, el barrio, el porqué de
-- que la ciudad esté construida sobre el agua. Eso no cabía en ninguna fila.
--
-- Con esto una audioguía cuelga de una actividad O de un día del itinerario,
-- nunca de las dos ni de ninguna:
--   activity_id no nulo  → audioguía del sitio (lo de siempre)
--   day_id      no nulo  → audioguía de la ciudad de ese día (lo nuevo)
--
-- trip_id se queda como estaba y sigue siendo NOT NULL: es la columna sobre la
-- que van TODAS las políticas RLS (has_trip_access) y la que usan las consultas
-- del panel. Al no tocarla, ni las políticas ni los RPC de admin se enteran de
-- este cambio.
-- ------------------------------------------------------------

alter table public.audioguides
  add column if not exists day_id uuid references public.itinerary_days(id) on delete cascade;

-- activity_id deja de ser obligatoria. Su UNIQUE original (audioguides_activity_id_key)
-- se queda tal cual y sigue haciendo su trabajo: en Postgres un índice único
-- admite varios NULL, así que todas las audioguías de día pueden convivir sin
-- pisarse mientras se mantiene "una audioguía como mucho por actividad".
alter table public.audioguides
  alter column activity_id drop not null;

-- El mismo "una como mucho" para los días. Parcial para no contar los NULL de
-- las audioguías de actividad.
create unique index if not exists audioguides_day_id_key
  on public.audioguides(day_id)
  where day_id is not null;

-- Exactamente uno de los dos. Sin esto cabría una fila huérfana (los dos NULL)
-- que no se podría abrir desde ninguna pantalla, o una fila ambigua (los dos
-- llenos) de la que nadie sabría de quién es.
alter table public.audioguides
  drop constraint if exists audioguides_scope_chk;
alter table public.audioguides
  add constraint audioguides_scope_chk
  check (num_nonnulls(activity_id, day_id) = 1);

create index if not exists idx_audioguides_day on public.audioguides(day_id);

comment on column public.audioguides.day_id is
  'Día del itinerario cuando la audioguía es de la ciudad del día. Excluyente con activity_id (audioguides_scope_chk)';

-- ------------------------------------------------------------
-- duplicate_trip() NO se toca a propósito.
--
-- La función copia guías, días y actividades, pero nunca ha copiado
-- audioguías: el viaje duplicado nace sin ellas, y así sigue. Es deliberado —
-- duplicar un viaje clonaría los MP3 del storage sin que nadie los haya pedido,
-- y cada parada cuesta dinero de sintetizar—. Al no copiarlas, day_id tampoco
-- necesita remapearse con tmp_day_map (comparar con la nota de 045, donde sí
-- hacía falta para cities).
-- ------------------------------------------------------------
