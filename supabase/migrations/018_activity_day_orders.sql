-- Orden independiente del banner de hotel en cada día de la estancia.
-- Un hotel es una sola fila (un único order_index) pero su banner se muestra en
-- todos los días que cubre; para poder ordenarlo en cada día sin que se "filtre"
-- a los demás, guardamos un mapa { [dayId]: posición } por hotel.
alter table activities
  add column if not exists day_orders jsonb not null default '{}'::jsonb;
