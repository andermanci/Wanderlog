-- ============================================================
-- WANDERLOG - Husos horarios de los movimientos y de cada día
-- ============================================================
-- activities.start_time / end_time son horas de PARED (`time` de Postgres: sin
-- fecha y sin zona). El usuario teclea lo que pone el billete — la salida en
-- hora local del origen y la llegada en hora local del destino — así que los
-- datos guardados YA SON CORRECTOS. Lo que faltaba era saber en qué huso está
-- escrita cada una: sin eso, la app las restaba a pelo y un Madrid–Tokio
-- mostraba una duración disparatada. NO hay que migrar ni una hora.
--
--  · activities.origin_tz / destination_tz → solo para 'flight' y 'transport'.
--  · itinerary_days.tz → huso por defecto del día (la ciudad donde estás). El
--    resto de tipos de actividad NO llevan huso propio: heredan el del día. Así
--    se rellenan ~14 filas por viaje en vez de cientos, y no se duplica un dato
--    que es derivable.
--
-- Se guarda el NOMBRE IANA ('Europe/Madrid'), nunca el offset: el offset depende
-- de la fecha (horario de verano) y caducaría en el próximo cambio de hora.
--
-- Sin CHECK de formato: 'UTC' y 'Etc/GMT+3' son nombres IANA válidos y no llevan
-- barra, así que cualquier regex razonable daría falsos negativos.
--
-- RLS: heredada. Son columnas de activities / itinerary_days, ya cubiertas por
-- las políticas de 003 y 035.

alter table public.activities
  add column if not exists origin_tz text,
  add column if not exists destination_tz text;

alter table public.itinerary_days
  add column if not exists tz text;

comment on column public.activities.origin_tz      is 'Zona IANA del origen: start_time es hora local de aquí';
comment on column public.activities.destination_tz is 'Zona IANA del destino: end_time es hora local de aquí';
comment on column public.itinerary_days.tz         is 'Zona IANA por defecto del día (la ciudad donde estás)';
