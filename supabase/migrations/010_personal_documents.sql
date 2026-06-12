-- ============================================================
-- WANDERLOG - Categorías de documentación personal
-- ============================================================
-- DNI, pasaporte, visado, carnet de conducir y tarjeta sanitaria,
-- separados de las reservas del viaje.

alter table public.documents drop constraint if exists documents_category_check;
alter table public.documents add constraint documents_category_check
  check (category in (
    'flight','train','bus','hotel','car_rental','transfer','tour','ticket','insurance','other',
    'passport','dni','visa','driving_license','health_card'
  ));
