-- ============================================================
-- WANDERLOG - Categoría de documentación personal: vacunas
-- ============================================================
-- El certificado de vacunación es un PDF suelto (como el visado): no tiene
-- anverso ni reverso, así que en la interfaz se sube como un único archivo.

alter table public.documents drop constraint if exists documents_category_check;
alter table public.documents add constraint documents_category_check
  check (category in (
    'flight','train','bus','hotel','car_rental','transfer','tour','ticket','insurance','other',
    'passport','dni','visa','driving_license','health_card','vaccines'
  ));
