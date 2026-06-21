-- Divisa por defecto de cada viaje: se usa al añadir gastos en ese viaje,
-- con preferencia sobre la divisa global del perfil.
alter table public.trips
  add column if not exists default_currency text not null default 'EUR';
