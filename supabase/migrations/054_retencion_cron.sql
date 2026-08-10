-- ============================================================
-- WANDERLOG - Retención de la telemetría
-- ============================================================
-- `page_views` es la única tabla que crece con el TRÁFICO y no con el uso: una
-- SPA genera una fila por pantalla. Orden de magnitud a vigilar: 50 personas ×
-- 30 pantallas/día ≈ 1.500 filas/día ≈ 135.000 en 90 días ≈ 40-60 MB con
-- índices, sobre los 500 MB del plan gratuito. Cabe, pero es la que hay que
-- mirar cuando el proyecto crezca.
--
-- La poda va con pg_cron y NO desde la aplicación: un delete contra la propia
-- base no puede fallar por red, no necesita despertar a nadie y no añade una
-- ruta HTTP más que proteger. Es el único cron que no llama a la app por HTTP.
--
-- Horarios desalineados del cron de `send-reminders` (que corre en punto) para
-- que no compitan por conexiones.

create extension if not exists pg_cron;

-- 90 días para las visitas. Es lo que se anuncia en la página de privacidad:
-- si se cambia aquí, hay que cambiarlo allí.
select cron.schedule(
  'wl-poda-visitas',
  '17 4 * * *',
  $job$ delete from public.page_views where at < now() - interval '90 days' $job$
);

-- Un año para los eventos de uso: son muchísimos menos (uno por acción, no por
-- pantalla) y la pregunta que contestan —«¿cuánto se usa esto?»— necesita
-- comparar con el año anterior.
select cron.schedule(
  'wl-poda-eventos',
  '23 4 * * *',
  $job$ delete from public.usage_events where at < now() - interval '365 days' $job$
);

-- El registro de auditoría NO se poda. Es minúsculo (una fila por acción de
-- administración) y su función es justamente durar: el día que alguien
-- pregunte por qué se borró su cuenta hace dos años, la respuesta tiene que
-- seguir ahí.
