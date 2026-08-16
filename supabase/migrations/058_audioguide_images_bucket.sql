-- ============================================================
-- WANDERLOG - El bucket de audioguías acepta también imágenes
-- ============================================================
-- La 057 añadió la imagen de cada parada. La primera versión guardaba la URL
-- de Wikimedia tal cual, y en la práctica no valía: las miniaturas rondaban
-- los 435 KB (casi 8 MB para una audioguía de museo) y Wikimedia responde 429
-- por su política de robots cuando llegan varias peticiones seguidas. Dentro
-- de un museo, con mala cobertura, eso es una imagen que no carga justo cuando
-- hace falta.
--
-- Así que las imágenes se rehospedan aquí ya reducidas y en WebP, igual que
-- place-photo hace con las fotos de Google. Van al MISMO bucket y bajo el
-- mismo prefijo `usuario/viaje/ámbito/` que los MP3 de sus paradas, y eso no
-- es casual: useDeleteAudioguide borra por ese prefijo, así que al regenerar
-- una audioguía se llevan por delante también sus imágenes, sin código extra.
--
-- Solo se amplía la lista de tipos permitidos; las políticas RLS del bucket
-- (escritura en la carpeta de cada usuario, lectura pública) no se tocan.
-- ------------------------------------------------------------

update storage.buckets
set allowed_mime_types = array['audio/mpeg', 'image/webp']
where id = 'audioguides';
