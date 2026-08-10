-- ============================================================
-- WANDERLOG - Analítica de visitas, propia
-- ============================================================
-- POR QUÉ PROPIA Y NO GOOGLE ANALYTICS: GA exige banner de consentimiento, y
-- sin consentimiento no mide — o sea que se pierde justo el tráfico frío que
-- se quería medir. Los bloqueadores se comen buena parte del resto. Y sobre
-- todo, GA no puede cruzarse con esta base, que es donde vive lo único que
-- interesa de verdad: si quien entra acaba creando un viaje.
--
-- QUÉ SE GUARDA Y QUÉ NO:
--   · NO la IP, ni entera ni recortada. Una IP recortada sigue siendo un dato
--     personal; una región no.
--   · NO la ciudad, ni las coordenadas, ni el código postal, aunque Netlify
--     los mande todos juntos en el mismo objeto.
--   · NO el user-agent crudo: solo cinco etiquetas de dispositivo. La cadena
--     entera es material de huella digital; «movil» no lo es.
--   · NO la query de la ruta: `/invite/<token>` da acceso a un viaje ajeno.
--   · El identificador de sesión vive en sessionStorage, NO es una cookie, no
--     viaja en ninguna petición y muere al cerrar la pestaña. Por eso no hace
--     falta banner: no hay nada que consentir.
--
-- Retención: 90 días, con una poda diaria (migración 054).

create table if not exists public.page_views (
  -- Lo genera el CLIENTE (crypto.randomUUID). Tiene que ser así: `sendBeacon`
  -- no puede leer la respuesta, y hacen falta DOS escrituras sobre la misma
  -- fila (apertura y cierre), así que el identificador debe conocerse antes.
  id            uuid        primary key,
  session_id    text        not null,
  -- SIN clave foránea a propósito. Comprobar que el usuario existe costaría
  -- una lectura por cada pantalla de cada visitante, y una tabla de analítica
  -- no puede bloquear una escritura por integridad referencial. Al borrar una
  -- cuenta, estas filas se anonimizan (user_id = null), no se borran: el
  -- tráfico agregado del sitio no es suyo.
  user_id       uuid,
  path          text        not null,
  section       text        not null,
  referrer_host text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  device        text        not null default 'desconocido',
  country       text,
  region        text,
  -- Milisegundos VISIBLES, no de reloj. `null` = el cierre nunca llegó, que
  -- pasa y es información en sí misma.
  ms            integer,
  at            timestamptz not null default now()
);

create index if not exists page_views_at_idx on public.page_views (at desc);
-- Índice PARCIAL: la mayoría de las filas son anónimas, y un índice completo
-- sobre una columna casi siempre nula es peso muerto.
create index if not exists page_views_user_idx
  on public.page_views (user_id) where user_id is not null;

alter table public.page_views enable row level security;
-- RLS activo y CERO políticas. Importa más aquí que en ninguna otra tabla:
-- la escribe un endpoint público, así que ni `anon` ni `authenticated` pueden
-- leerla ni tocarla. Solo entra el service_role desde la edge function.

-- ------------------------------------------------------------
-- Última vista: la alarma de «esto ha dejado de grabar»
-- ------------------------------------------------------------
-- El endpoint de ingesta responde 204 pase lo que pase, así que un fallo es
-- invisible por diseño. Esta función permite que el panel enseñe «última
-- visita hace X» y lo marque en rojo pasadas unas horas, que es la única
-- alarma que alguien mira de verdad.
create or replace function public.admin_last_view()
returns timestamptz
language plpgsql
security definer
stable
set search_path = public
as $$
declare v timestamptz;
begin
  perform public.admin_guard();
  select max(at) into v from public.page_views;
  return v;
end;
$$;

revoke all on function public.admin_last_view() from public, anon;
grant execute on function public.admin_last_view() to authenticated;
