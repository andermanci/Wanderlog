-- ============================================================
-- WANDERLOG - Viaje generado: JAPÓN (19 nov – 8 dic 2026)
-- ============================================================
-- Genera el viaje completo a partir de la "Guía Completa de Viaje · Japón":
--   · El viaje, sus 20 días y ~80 actividades geolocalizadas (cada sitio con
--     sus coordenadas reales de Google Maps -> aparecen como pines y ruta en
--     el mapa de la app).
--   · Documentos: vuelos Qatar Airways (ida/vuelta, localizador CL9Y64),
--     JR Pass, Hakone Free Pass y Welcome Suica.
--
-- Idempotente: usa un id de viaje fijo; al re-ejecutarse limpia y reinserta
-- sus actividades/documentos. Se ejecuta como `postgres` (db push), por lo que
-- omite RLS. Resuelve el usuario por email; si no existe, no hace nada.
-- ============================================================

do $$
declare
  v_user uuid;
  v_trip uuid := 'a1c9d000-0000-4a00-b000-000000000a7a'::uuid;  -- id fijo del viaje Japón
begin
  -- Usuario destino (el dueño): por email y, si no, el primer perfil.
  select id into v_user from public.profiles where email = 'andermanci6@gmail.com' limit 1;
  if v_user is null then
    select id into v_user from public.profiles order by created_at limit 1;
  end if;
  if v_user is null then
    raise notice 'WANDERLOG: no hay ningún perfil; se omite el seed de Japón.';
    return;
  end if;

  -- ---------------------------------------------------------- VIAJE
  insert into public.trips (id, user_id, name, description, destination, start_date, end_date, status, budget_total, tags)
  values (
    v_trip, v_user, 'Japón',
    'Ruta lineal de este a oeste: Tokyo · Hakone · Takayama · Kanazawa · Kyoto · Nara · Hiroshima · Osaka. '
      || '17 noches en temporada de momiji. Vuelos Qatar Airways (localizador CL9Y64).',
    'Japón', '2026-11-19', '2026-12-08', 'confirmed', 9730, array['Japón','Otoño','Momiji','Shinkansen']
  )
  on conflict (id) do update set
    name = excluded.name, description = excluded.description, destination = excluded.destination,
    start_date = excluded.start_date, end_date = excluded.end_date, status = excluded.status,
    budget_total = excluded.budget_total, tags = excluded.tags;

  -- ---------------------------------------------------------- DÍAS (19 nov -> 8 dic)
  insert into public.itinerary_days (trip_id, date)
  select v_trip, d::date
  from generate_series('2026-11-19'::date, '2026-12-08'::date, interval '1 day') d
  on conflict (trip_id, date) do nothing;

  -- ---------------------------------------------------------- ACTIVIDADES (idempotente)
  delete from public.activities where trip_id = v_trip;

  insert into public.activities (
    trip_id, day_id, type, title, description, address, start_time, price, order_index,
    lat, lng, origin, destination, origin_lat, origin_lng, destination_lat, destination_lng, external_link
  )
  select v_trip, d.id, x.typ, x.title, x.descr, x.address, x.stime, x.price, x.ord,
         x.lat, x.lng, x.origin, x.dest, x.olat, x.olng, x.dlat, x.dlng, x.link
  from (values
    -- ===== 19 nov · Vuelo de ida =====
    ('2026-11-19'::date,'flight'::text,'Vuelo QR150 Madrid → Doha'::text,'Qatar Airways · Localizador CL9Y64. Escala en Doha (QR806 a Narita, llegada 20 nov 17:55).'::text,'Madrid-Barajas T4S (MAD)'::text,'15:20'::time,null::numeric,1::int,null::numeric,null::numeric,null::text,null::text,null::numeric,null::numeric,null::numeric,null::numeric,null::text),

    -- ===== 20 nov · Día 1 · Llegada a Tokyo =====
    ('2026-11-20','transport','Narita Express a Tokyo',null,null,'19:00',null,1,null,null,'Aeropuerto de Narita T2','Shinjuku, Tokyo',35.7720,140.3929,35.6896,139.6917,null),
    ('2026-11-20','hotel','Check-in hotel (Shinjuku/Shibuya)',null,'Shinjuku, Tokyo','20:00',null,2,35.6938,139.7034,null,null,null,null,null,null,null),
    ('2026-11-20','activity','Mirador del Tokyo Metropolitan Government Building','Mirador gratuito hasta las 22:30.','Nishi-Shinjuku, Tokyo',null,0,3,35.6896,139.6917,null,null,null,null,null,null,null),
    ('2026-11-20','place','Kabukicho','El barrio de ocio más animado de Tokyo.','Kabukicho, Shinjuku',null,null,4,35.6955,139.7005,null,null,null,null,null,null,null),
    ('2026-11-20','restaurant','Cena en Omoide Yokocho','Callejón de yakitori y ramen (desde ¥700).','Omoide Yokocho, Shinjuku','21:00',null,5,35.6938,139.6996,null,null,null,null,null,null,null),

    -- ===== 21 nov · Día 2 · Tokyo clásico =====
    ('2026-11-21','activity','Templo Senso-ji','Asakusa. Abierto siempre.','Asakusa, Tokyo','09:00',0,1,35.7148,139.7967,null,null,null,null,null,null,null),
    ('2026-11-21','place','Puerta Kaminarimon',null,'Asakusa, Tokyo',null,null,2,35.7111,139.7956,null,null,null,null,null,null,null),
    ('2026-11-21','place','Calle Nakamise','Souvenirs camino al templo.','Nakamise-dori, Asakusa',null,null,3,35.7126,139.7966,null,null,null,null,null,null,null),
    ('2026-11-21','place','Calle Kappabashi (Kitchen Town)','Menaje y cuchillos japoneses.','Kappabashi, Tokyo',null,null,4,35.7146,139.7889,null,null,null,null,null,null,null),
    ('2026-11-21','activity','Tokyo Skytree','Tembo Deck. Reservar online.','Oshiage, Tokyo',null,13,5,35.7101,139.8107,null,null,null,null,null,null,null),
    ('2026-11-21','place','Parque Ueno',null,'Ueno, Tokyo',null,0,6,35.7156,139.7745,null,null,null,null,null,null,null),
    ('2026-11-21','place','Palacio Imperial y jardines',null,'Chiyoda, Tokyo',null,0,7,35.6852,139.7528,null,null,null,null,null,null,null),
    ('2026-11-21','place','Akihabara','Electrónica y cultura otaku.','Akihabara, Tokyo',null,null,8,35.7022,139.7745,null,null,null,null,null,null,null),
    ('2026-11-21','place','Estatua de Hachiko',null,'Shibuya, Tokyo',null,null,9,35.6590,139.7006,null,null,null,null,null,null,null),
    ('2026-11-21','place','Shibuya Crossing',null,'Shibuya, Tokyo',null,null,10,35.6595,139.7004,null,null,null,null,null,null,null),
    ('2026-11-21','activity','Mirador Shibuya Sky','Vistas nocturnas. Reservar.','Shibuya Scramble Square',null,13,11,35.6580,139.7016,null,null,null,null,null,null,null),

    -- ===== 22 nov · Día 3 · Tokyo moderno y cultural =====
    ('2026-11-22','activity','Santuario Meiji-jingu','Cierra al atardecer.','Yoyogi, Shibuya','09:00',0,1,35.6764,139.6993,null,null,null,null,null,null,null),
    ('2026-11-22','place','Parque Yoyogi',null,'Yoyogi, Tokyo',null,0,2,35.6716,139.6949,null,null,null,null,null,null,null),
    ('2026-11-22','place','Calle Takeshita (Harajuku)',null,'Harajuku, Tokyo',null,null,3,35.6716,139.7065,null,null,null,null,null,null,null),
    ('2026-11-22','place','Omotesando','Arquitectura moderna.','Omotesando, Tokyo',null,null,4,35.6657,139.7124,null,null,null,null,null,null,null),
    ('2026-11-22','activity','teamLab Planets','Reserva obligatoria con antelación.','Toyosu, Odaiba','15:00',24,5,35.6489,139.7905,null,null,null,null,null,null,null),
    ('2026-11-22','place','Odaiba (Gundam y DiverCity)',null,'Odaiba, Tokyo',null,null,6,35.6250,139.7756,null,null,null,null,null,null,null),

    -- ===== 23 nov · Día 4 · Mercado, barrios y excursión =====
    ('2026-11-23','restaurant','Mercado exterior de Tsukiji','Desayuno de sushi fresco.','Tsukiji, Tokyo','08:00',null,1,35.6655,139.7706,null,null,null,null,null,null,null),
    ('2026-11-23','activity','Jardín Hama-rikyu','Casa de té sobre el agua.','Hama-rikyu, Tokyo',null,2,2,35.6597,139.7634,null,null,null,null,null,null,null),
    ('2026-11-23','place','Barrio de Yanaka','Ambiente retro.','Yanaka, Tokyo',null,null,3,35.7281,139.7660,null,null,null,null,null,null,null),
    ('2026-11-23','place','Nakameguro / Shimokitazawa',null,'Nakameguro, Tokyo',null,null,4,35.6440,139.6987,null,null,null,null,null,null,null),
    ('2026-11-23','place','Kamakura (excursión opcional)','Gran Buda, templos junto al mar (1h en tren).','Kamakura',null,null,5,35.3169,139.5359,null,null,null,null,null,null,null),

    -- ===== 24 nov · Día 5 · Hakone y Monte Fuji =====
    ('2026-11-24','transport','Shinkansen a Odawara — ACTIVAR JR PASS','Enlazar con el Hakone Free Pass (2 días).',null,'09:00',null,1,null,null,'Tokyo','Odawara',35.6812,139.7671,35.2564,139.1553,null),
    ('2026-11-24','activity','Owakudani','Huevos negros (pack de 5).','Owakudani, Hakone',null,3,2,35.2445,139.0197,null,null,null,null,null,null,null),
    ('2026-11-24','place','Lago Ashi (barco pirata)','Vistas al Monte Fuji.','Lago Ashi, Hakone',null,null,3,35.2069,139.0244,null,null,null,null,null,null,null),
    ('2026-11-24','activity','Santuario Hakone',null,'Hakone Shrine',null,0,4,35.2046,139.0258,null,null,null,null,null,null,null),
    ('2026-11-24','hotel','Ryokan con onsen (Hakone)','Experiencia imprescindible.','Hakone',null,null,5,35.2324,139.1069,null,null,null,null,null,null,null),

    -- ===== 25 nov · Día 6 · Viaje a Takayama =====
    ('2026-11-25','transport','Shinkansen a Nagoya + Wide View Hida','Nagoya (1h) -> Takayama (2h 30min).',null,'10:00',null,1,null,null,'Odawara','Takayama',35.2564,139.1553,36.1438,137.2526,null),
    ('2026-11-25','place','Casco histórico Sanmachi Suji','Sake breweries con degustaciones.','Sanmachi, Takayama',null,0,2,36.1408,137.2596,null,null,null,null,null,null,null),
    ('2026-11-25','restaurant','Cena hida-gyu (wagyu local)',null,'Takayama','20:00',null,3,36.1430,137.2570,null,null,null,null,null,null,null),
    ('2026-11-25','hotel','Ryokan / Hotel Takayama',null,'Takayama',null,null,4,36.1438,137.2526,null,null,null,null,null,null,null),

    -- ===== 26 nov · Día 7 · Shirakawa-go =====
    ('2026-11-26','transport','Bus Nohi a Shirakawa-go','UNESCO. Conviene reservar.',null,'08:30',null,1,null,null,'Takayama','Shirakawa-go',36.1438,137.2526,36.2578,136.9063,null),
    ('2026-11-26','activity','Casa Wada','Casa gasshō-zukuri.','Shirakawa-go',null,2,2,36.2585,136.9070,null,null,null,null,null,null,null),
    ('2026-11-26','activity','Mirador Shiroyama','Panorámica del pueblo (15 min a pie).','Shiroyama, Shirakawa-go',null,0,3,36.2607,136.9089,null,null,null,null,null,null,null),
    ('2026-11-26','place','Mercado matutino Miyagawa',null,'Miyagawa, Takayama',null,null,4,36.1422,137.2620,null,null,null,null,null,null,null),

    -- ===== 27 nov · Día 8 · Kanazawa =====
    ('2026-11-27','transport','Bus Nohi a Kanazawa',null,null,'09:00',null,1,null,null,'Takayama','Kanazawa',36.1438,137.2526,36.5780,136.6479,null),
    ('2026-11-27','activity','Jardín Kenroku-en','Top 3 jardines de Japón.','Kenroku-en, Kanazawa',null,2,2,36.5620,136.6626,null,null,null,null,null,null,null),
    ('2026-11-27','place','Castillo de Kanazawa',null,'Kanazawa',null,0,3,36.5648,136.6590,null,null,null,null,null,null,null),
    ('2026-11-27','place','Barrio samurái Nagamachi',null,'Nagamachi, Kanazawa',null,null,4,36.5667,136.6536,null,null,null,null,null,null,null),
    ('2026-11-27','activity','Casa Nomura',null,'Nagamachi, Kanazawa',null,3.5,5,36.5667,136.6530,null,null,null,null,null,null,null),
    ('2026-11-27','restaurant','Mercado Omicho','Sushi fresco.','Omicho, Kanazawa',null,null,6,36.5719,136.6580,null,null,null,null,null,null,null),
    ('2026-11-27','place','Barrio de geishas Higashi Chaya',null,'Higashi Chaya, Kanazawa',null,0,7,36.5722,136.6663,null,null,null,null,null,null,null),
    ('2026-11-27','hotel','Hotel Kanazawa (centro)',null,'Kanazawa',null,null,8,36.5780,136.6479,null,null,null,null,null,null,null),

    -- ===== 28 nov · Día 9 · Llegada a Kyoto =====
    ('2026-11-28','transport','Thunderbird Express a Kyoto',null,null,'10:00',null,1,null,null,'Kanazawa','Kyoto',36.5780,136.6479,34.9858,135.7588,null),
    ('2026-11-28','activity','Kinkaku-ji (Pabellón Dorado)',null,'Kinkaku-ji, Kyoto',null,3,2,35.0394,135.7292,null,null,null,null,null,null,null),
    ('2026-11-28','place','Camino del Filósofo',null,'Higashiyama, Kyoto',null,null,3,35.0264,135.7949,null,null,null,null,null,null,null),
    ('2026-11-28','place','Barrio de Gion','Posibilidad de ver maikos.','Gion, Kyoto',null,null,4,35.0037,135.7752,null,null,null,null,null,null,null),
    ('2026-11-28','restaurant','Callejón de Pontocho','Izakayas junto al río Kamo.','Pontocho, Kyoto','20:00',null,5,35.0048,135.7707,null,null,null,null,null,null,null),
    ('2026-11-28','hotel','Hotel Kyoto (cerca de la estación)',null,'Kyoto',null,null,6,34.9858,135.7588,null,null,null,null,null,null,null),

    -- ===== 29 nov · Día 10 · Kyoto: templos del este =====
    ('2026-11-29','activity','Fushimi Inari Taisha','Miles de torii naranjas. Llegar antes de las 8:00.','Fushimi, Kyoto','07:30',0,1,34.9671,135.7727,null,null,null,null,null,null,null),
    ('2026-11-29','activity','Kiyomizu-dera','Plataforma panorámica.','Higashiyama, Kyoto',null,2.5,2,34.9949,135.7850,null,null,null,null,null,null,null),
    ('2026-11-29','place','Ninenzaka y Sannenzaka',null,'Higashiyama, Kyoto',null,null,3,34.9967,135.7807,null,null,null,null,null,null,null),
    ('2026-11-29','activity','Santuario Heian Jingu','Gran torii rojo.','Okazaki, Kyoto',null,0,4,35.0160,135.7822,null,null,null,null,null,null,null),
    ('2026-11-29','activity','Ginkaku-ji (Pabellón de Plata)',null,'Sakyo, Kyoto',null,3,5,35.0270,135.7982,null,null,null,null,null,null,null),
    ('2026-11-29','activity','Nanzen-ji','Exteriores gratis.','Nanzen-ji, Kyoto',null,3,6,35.0113,135.7937,null,null,null,null,null,null,null),

    -- ===== 30 nov · Día 11 · Kyoto: Arashiyama =====
    ('2026-11-30','place','Bosque de Bambú de Arashiyama','Llegar antes de las 9:00.','Arashiyama, Kyoto','08:30',0,1,35.0170,135.6716,null,null,null,null,null,null,null),
    ('2026-11-30','activity','Templo Tenryu-ji','Jardín zen.','Arashiyama, Kyoto',null,3,2,35.0157,135.6738,null,null,null,null,null,null,null),
    ('2026-11-30','place','Puente Togetsukyo',null,'Arashiyama, Kyoto',null,0,3,35.0128,135.6776,null,null,null,null,null,null,null),
    ('2026-11-30','activity','Parque de Monos Iwatayama','Panorámica de Kyoto.','Arashiyama, Kyoto',null,3.5,4,35.0099,135.6770,null,null,null,null,null,null,null),
    ('2026-11-30','activity','Templo Gio-ji','Jardín de musgo.','Sagano, Kyoto',null,2,5,35.0228,135.6678,null,null,null,null,null,null,null),

    -- ===== 1 dic · Día 12 · Excursión a Nara =====
    ('2026-12-01','transport','JR Nara Line a Nara',null,null,'09:00',null,1,null,null,'Kyoto','Nara',34.9858,135.7588,34.6851,135.8430,null),
    ('2026-12-01','place','Parque de Nara (ciervos)','Galletas shika senbei.','Nara Park',null,0,2,34.6851,135.8430,null,null,null,null,null,null,null),
    ('2026-12-01','activity','Todai-ji (Gran Buda)','Buda de bronce de 15 m.','Todai-ji, Nara',null,4,3,34.6890,135.8398,null,null,null,null,null,null,null),
    ('2026-12-01','activity','Kasuga Taisha','Miles de linternas.','Kasuga, Nara',null,3,4,34.6818,135.8483,null,null,null,null,null,null,null),

    -- ===== 2 dic · Día 13 · Kyoto -> Hiroshima =====
    ('2026-12-02','activity','Tofuku-ji','Momiji espectacular.','Tofuku-ji, Kyoto','08:30',3,1,34.9764,135.7740,null,null,null,null,null,null,null),
    ('2026-12-02','restaurant','Nishiki Market','Paseo gastronómico.','Nishiki, Kyoto',null,0,2,35.0050,135.7649,null,null,null,null,null,null,null),
    ('2026-12-02','transport','Shinkansen directo a Hiroshima',null,null,'12:00',null,3,null,null,'Kyoto','Hiroshima',34.9858,135.7588,34.3978,132.4757,null),
    ('2026-12-02','activity','Parque Memorial de la Paz',null,'Naka, Hiroshima',null,0,4,34.3915,132.4527,null,null,null,null,null,null,null),
    ('2026-12-02','activity','Museo de la Paz','Imprescindible.','Hiroshima',null,1.3,5,34.3914,132.4523,null,null,null,null,null,null,null),
    ('2026-12-02','place','Cúpula Genbaku (A-Bomb Dome)','UNESCO. Solo exterior.','Hiroshima',null,0,6,34.3955,132.4536,null,null,null,null,null,null,null),
    ('2026-12-02','restaurant','Okonomiyaki estilo Hiroshima',null,'Hiroshima','20:00',null,7,34.3955,132.4590,null,null,null,null,null,null,null),
    ('2026-12-02','hotel','Hotel Hiroshima (centro)',null,'Hiroshima',null,null,8,34.3978,132.4757,null,null,null,null,null,null,null),

    -- ===== 3 dic · Día 14 · Miyajima -> Osaka =====
    ('2026-12-03','transport','Ferry a Miyajima',null,null,'08:30',null,1,null,null,'Hiroshima','Miyajima',34.3978,132.4757,34.2960,132.3197,null),
    ('2026-12-03','activity','Torii flotante de Itsukushima','Consulta las mareas para verlo "flotar".','Itsukushima, Miyajima',null,2,2,34.2960,132.3197,null,null,null,null,null,null,null),
    ('2026-12-03','activity','Teleférico Monte Misen',null,'Miyajima',null,12.5,3,34.2880,132.3145,null,null,null,null,null,null,null),
    ('2026-12-03','transport','Shinkansen Hiroshima → Osaka',null,null,'13:00',null,4,null,null,'Hiroshima','Osaka',34.3978,132.4757,34.7024,135.4959,null),
    ('2026-12-03','restaurant','Dotonbori','Takoyaki, kushikatsu. Street food.','Dotonbori, Osaka','20:00',null,5,34.6687,135.5013,null,null,null,null,null,null,null),
    ('2026-12-03','hotel','Hotel Osaka (Namba/Dotonbori)',null,'Namba, Osaka',null,null,6,34.6660,135.5020,null,null,null,null,null,null,null),

    -- ===== 4 dic · Día 15 · Osaka a fondo =====
    ('2026-12-04','restaurant','Mercado Kuromon Ichiba','"La cocina de Osaka".','Nipponbashi, Osaka','09:00',null,1,34.6657,135.5061,null,null,null,null,null,null,null),
    ('2026-12-04','activity','Castillo de Osaka','Museo interior y vistas.','Osaka Castle',null,4,2,34.6873,135.5259,null,null,null,null,null,null,null),
    ('2026-12-04','activity','Templo Shitenno-ji','El templo budista más antiguo de Japón.','Tennoji, Osaka',null,2,3,34.6543,135.5167,null,null,null,null,null,null,null),
    ('2026-12-04','place','Santuario Sumiyoshi Taisha','Puente rojo arqueado.','Sumiyoshi, Osaka',null,0,4,34.6122,135.4933,null,null,null,null,null,null,null),
    ('2026-12-04','activity','Torre Tsutenkaku (Shinsekai)',null,'Shinsekai, Osaka',null,5.5,5,34.6524,135.5063,null,null,null,null,null,null,null),
    ('2026-12-04','place','Namba y Shinsaibashi',null,'Namba, Osaka',null,null,6,34.6680,135.5010,null,null,null,null,null,null,null),

    -- ===== 5 dic · Día 16 · Kobe + Osaka =====
    ('2026-12-05','transport','Tren a Kobe (30 min)',null,null,'09:30',null,1,null,null,'Osaka','Kobe',34.7024,135.4959,34.6901,135.1955,null),
    ('2026-12-05','place','Barrio de Kitano (Kobe)','Casas de extranjeros del s. XIX.','Kitano, Kobe',null,null,2,34.7016,135.1894,null,null,null,null,null,null,null),
    ('2026-12-05','restaurant','Carne de Kobe (set lunch)','Más asequible que la cena.','Kobe','13:00',30,3,34.6950,135.1950,null,null,null,null,null,null,null),
    ('2026-12-05','place','Puerto de Kobe (Harborland)',null,'Harborland, Kobe',null,null,4,34.6797,135.1810,null,null,null,null,null,null,null),
    ('2026-12-05','place','Nakazakicho','Cafés y tiendas vintage.','Nakazakicho, Osaka',null,null,5,34.7079,135.5060,null,null,null,null,null,null,null),
    ('2026-12-05','restaurant','Tenma (yokocho)','Bares locales.','Tenma, Osaka','21:00',null,6,34.7039,135.5108,null,null,null,null,null,null,null),

    -- ===== 6 dic · Día 17 · Último día completo =====
    ('2026-12-06','place','Compras en Shinsaibashi','Souvenirs y dulces japoneses.','Shinsaibashi, Osaka',null,null,1,34.6720,135.5010,null,null,null,null,null,null,null),
    ('2026-12-06','place','Den Den Town','Electrónica y anime.','Nipponbashi, Osaka',null,null,2,34.6611,135.5050,null,null,null,null,null,null,null),
    ('2026-12-06','restaurant','Última cena memorable','Okonomiyaki, yakiniku o sushi omakase.','Namba, Osaka','20:30',null,3,34.6627,135.5016,null,null,null,null,null,null,null),

    -- ===== 7 dic · Día 18 · Vuelo de vuelta =====
    ('2026-12-07','transport','Haruka Express al aeropuerto de Kansai','Salir del hotel sobre las 14:00 (estar 3h antes).',null,'14:30',null,1,null,null,'Tennoji, Osaka','Aeropuerto de Kansai (KIX)',34.6463,135.5135,34.4347,135.2441,null),
    ('2026-12-07','flight','Vuelo QR803 Kansai → Doha','Qatar Airways · Localizador CL9Y64. Escala en Doha (QR147 a Madrid).','Aeropuerto de Kansai T1 (KIX)','17:55',null,2,null,null,null,null,null,null,null,null,null),

    -- ===== 8 dic · Llegada a Madrid =====
    ('2026-12-08','flight','Vuelo QR147 Doha → Madrid (llegada)','Llegada a Madrid-Barajas T4S a las 06:35.','Madrid-Barajas T4S','06:35',null,1,null,null,null,null,null,null,null,null,null)
  ) as x(date, typ, title, descr, address, stime, price, ord, lat, lng, origin, dest, olat, olng, dlat, dlng, link)
  join public.itinerary_days d on d.trip_id = v_trip and d.date = x.date;

  -- ---------------------------------------------------------- DOCUMENTOS (idempotente)
  delete from public.documents where trip_id = v_trip;

  insert into public.documents (trip_id, category, title, provider, locator, origin, destination, datetime_start, datetime_end, notes)
  values
    (v_trip,'flight','Vuelo Madrid → Tokyo (ida)','Qatar Airways','CL9Y64','Madrid-Barajas T4S (MAD)','Narita T2 (NRT)',
       '2026-11-19 15:20:00+01','2026-11-20 17:55:00+09',
       'QR150 MAD 15:20 → DOH 23:55 · escala 2h20 · QR806 DOH 02:15 → NRT 17:55. Equipaje: 25 kg + mano 7 kg.'),
    (v_trip,'flight','Vuelo Osaka → Madrid (vuelta)','Qatar Airways','CL9Y64','Kansai T1 (KIX)','Madrid-Barajas T4S (MAD)',
       '2026-12-07 17:55:00+09','2026-12-08 06:35:00+01',
       'QR803 KIX 17:55 → DOH 00:05 · escala 55 min · QR147 DOH 01:00 → MAD 06:35. Tasa de salida incluida.');

  insert into public.documents (trip_id, category, title, provider, notes)
  values
    (v_trip,'train','Japan Rail Pass · 14 días (Ordinary)','JR',
       'Activar el 24 nov (salida a Hakone); cubre hasta el 7 dic, incluido el Haruka al aeropuerto. ~449€.'),
    (v_trip,'ticket','Hakone Free Pass (2 días)','Odakyu',
       'Cubre todo el transporte interno de Hakone (teleférico, barco pirata, buses). ¥6.100 (~42€).'),
    (v_trip,'other','Welcome Suica (tarjeta IC)','JR East',
       'Comprar en el JR East Travel Service Center de Narita (T2-3, planta B1). Sin depósito, válida 28 días. Cargar ¥3.000.');

  raise notice 'WANDERLOG: viaje a Japón creado para el usuario %.', v_user;
end $$;
