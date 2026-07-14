-- ============================================================
-- WANDERLOG - Vincular una reserva con su actividad del itinerario
-- ============================================================
-- Hasta ahora un vuelo se metía DOS veces y nada las unía: una como `activity`
-- (para que salga en el itinerario) y otra como `document` (para el localizador,
-- el asiento y el PDF de la tarjeta de embarque). No había ninguna FK entre
-- ambas tablas, en ninguna dirección.
--
-- Con esto, la importación del .ics crea las dos de una pasada y las enlaza, y
-- la tarjeta de la actividad puede enseñar el localizador sin duplicar el dato.
--
-- on delete set null: borrar la actividad del itinerario no debe llevarse por
-- delante la tarjeta de embarque.

alter table public.documents
  add column if not exists activity_id uuid references public.activities(id) on delete set null;

create index if not exists documents_activity_id_idx
  on public.documents(activity_id) where activity_id is not null;

comment on column public.documents.activity_id is 'Actividad del itinerario que representa esta reserva (importación .ics)';
