-- ============================================================
-- WANDERLOG - Por qué no compensa el transporte público
-- ============================================================
-- Cuando un trayecto no merece la pena en transporte público, la IA dice el
-- motivo y qué es mejor en su lugar. Con eso el conector puede mostrar el
-- trayecto andando (y contarlo así en el día) y la ficha explicar el porqué
-- con una comparación, en vez de un texto suelto.
-- Las filas anteriores quedan a null: el cliente lo deduce de las distancias.

alter table public.transit_routes
  add column if not exists skip_reason text
    check (skip_reason in ('cerca', 'sin_linea', 'transbordos', 'lento', 'otro')),
  add column if not exists alternative text
    check (alternative in ('walk', 'taxi', 'car'));
