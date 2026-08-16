-- ============================================================
-- WANDERLOG - Imagen de cada parada de la audioguía
-- ============================================================
-- Escuchando una audioguía dentro de un museo, el problema no es entender la
-- explicación: es saber CUÁL de las veinte tablas de la sala te la están
-- contando. "La gran tabla horizontal dominada por un jardín" resuelve poco
-- delante de una pared con seis cuadros parecidos. Una miniatura de la obra lo
-- resuelve en un vistazo.
--
-- image_url: URL directa de la imagen. Se guarda la de Wikimedia Commons tal
--   cual, sin rehospedarla como sí hace place-photo con las fotos de Google:
--   allí era obligatorio (Google prohíbe servir sus URLs) y aquí no lo es —
--   Wikimedia permite el enlace directo y sus URLs son estables—. Para verlas
--   sin conexión ya está la caché de fotos del cliente (src/lib/photoCache.ts),
--   que es por donde pasan también las portadas y los adjuntos.
-- image_credit: autor y licencia en texto plano, para poder citarlo debajo.
--   Con obras antiguas casi siempre es dominio público, pero la fotografía que
--   las reproduce puede no serlo, así que se guarda lo que diga la fuente.
--
-- Las dos son opcionales a propósito: una parada puede no tener imagen
-- razonable ("El Primer Corredor", "La escalera de salida") y eso es normal,
-- no un estado a medias. Sin imagen, la pantalla se queda como estaba.
-- ------------------------------------------------------------

alter table public.audioguide_stops
  add column if not exists image_url text,
  add column if not exists image_credit text;

comment on column public.audioguide_stops.image_url is
  'Imagen de lo que se está describiendo (normalmente Wikimedia Commons). NULL si la parada no es identificable con una foto';
comment on column public.audioguide_stops.image_credit is
  'Autoría y licencia de la imagen, para citarla junto a ella';
