-- ============================================================
-- WANDERLOG - Nuevo motivo: a esa hora apenas hay servicio
-- ============================================================
-- El prompt ahora lleva el día y la hora de cada trayecto. Un trayecto puede
-- no compensar porque a esa hora ya no pasan trenes (o el bus sale cada hora).

alter table public.transit_routes drop constraint if exists transit_routes_skip_reason_check;
alter table public.transit_routes
  add constraint transit_routes_skip_reason_check
    check (skip_reason in ('cerca', 'sin_linea', 'transbordos', 'lento', 'horario', 'otro'));
