-- ============================================================
-- WANDERLOG - Número de vuelo en las reservas
-- ============================================================
-- Los vuelos guardaban proveedor, localizador y asiento, pero no el número de
-- vuelo (IB3456), que es el dato que identifica el trayecto y con el que en el
-- futuro se podrá consultar el estado en tiempo real (puerta, retrasos…).
--
-- Columna nueva y opcional en documents; solo se rellena para vuelos. No afecta
-- a duplicate_trip (que no copia documentos).

alter table public.documents
  add column if not exists flight_number text;

comment on column public.documents.flight_number is 'Número de vuelo (p. ej. IB3456); solo para category = flight';
