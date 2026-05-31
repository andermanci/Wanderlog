-- ============================================================
-- WANDERLOG - Datos de ejemplo (seed)
-- ============================================================
-- Ejecutar DESPUÉS de autenticar con Google OAuth y obtener tu user_id
-- Sustituye 'YOUR_USER_ID' por tu UUID real de auth.users
-- ============================================================

-- Para obtener tu user_id: SELECT id FROM auth.users LIMIT 1;

DO $$
DECLARE
  v_user_id uuid := 'YOUR_USER_ID'::uuid; -- ← Cambia esto
  v_trip1_id uuid := gen_random_uuid();
  v_trip2_id uuid := gen_random_uuid();
  v_day1_id uuid;
  v_day2_id uuid;
  v_day3_id uuid;
  v_day4_id uuid;
  v_day5_id uuid;
BEGIN

-- ============================================================
-- VIAJE 1: Tokio
-- ============================================================
INSERT INTO public.trips (id, user_id, name, description, destination, start_date, end_date, status, budget_total, tags)
VALUES (
  v_trip1_id,
  v_user_id,
  'Tokio & Kioto 2025',
  'Un viaje soñado por el corazón del Japón. Desde los rascacielos de Shinjuku hasta los templos silenciosos de Kioto.',
  'Tokio, Japón',
  '2025-09-15',
  '2025-09-24',
  'confirmed',
  4500.00,
  ARRAY['Asia', 'Cultura', 'Gastronomía', 'Templos']
);

-- Días itinerario Tokio
SELECT id INTO v_day1_id FROM public.itinerary_days
  WHERE trip_id = v_trip1_id AND date = '2025-09-15' LIMIT 1;

IF v_day1_id IS NULL THEN
  INSERT INTO public.itinerary_days (id, trip_id, date, notes) VALUES
    (gen_random_uuid(), v_trip1_id, '2025-09-15', 'Llegada. Vuelo Madrid → Tokio con escala en Helsinki. Hotel cerca de Shinjuku.'),
    (gen_random_uuid(), v_trip1_id, '2025-09-16', 'Día completo en Tokio: Shinjuku, Harajuku, Shibuya.'),
    (gen_random_uuid(), v_trip1_id, '2025-09-17', 'Asakusa, Akihabara y crucero por el río Sumida.'),
    (gen_random_uuid(), v_trip1_id, '2025-09-18', 'Viaje en tren a Kioto. Check-in Ryokan.'),
    (gen_random_uuid(), v_trip1_id, '2025-09-19', 'Fushimi Inari, Gion y Kinkaku-ji.'),
    (gen_random_uuid(), v_trip1_id, '2025-09-20', 'Nara (día trip). Los ciervos sagrados.'),
    (gen_random_uuid(), v_trip1_id, '2025-09-21', 'Regreso a Tokio. Akihabara.'),
    (gen_random_uuid(), v_trip1_id, '2025-09-22', 'Monte Fuji excursión.'),
    (gen_random_uuid(), v_trip1_id, '2025-09-23', 'Compras en Ginza. Último día en Tokio.'),
    (gen_random_uuid(), v_trip1_id, '2025-09-24', 'Vuelo de vuelta. Aeropuerto Haneda.')
  RETURNING id INTO v_day1_id;
END IF;

-- Documentos Tokio
INSERT INTO public.documents (trip_id, category, title, confirmation_number, locator, provider, datetime_start, datetime_end, origin, destination, seat)
VALUES
  (v_trip1_id, 'flight', 'Vuelo Madrid → Helsinki → Tokio', 'IB2345', 'XKPL89', 'Iberia / Finnair', '2025-09-15 07:30:00+02', '2025-09-16 11:45:00+09', 'Madrid (MAD)', 'Tokio Narita (NRT)', '34B'),
  (v_trip1_id, 'hotel', 'Park Hyatt Tokyo', 'HYATT-9821', NULL, 'Park Hyatt', '2025-09-15 15:00:00+09', '2025-09-21 11:00:00+09', NULL, NULL, NULL),
  (v_trip1_id, 'hotel', 'Ryokan Yoshida-ya', 'RYO-45621', NULL, 'Ryokan Yoshida-ya', '2025-09-18 16:00:00+09', '2025-09-21 11:00:00+09', NULL, NULL, NULL),
  (v_trip1_id, 'insurance', 'Seguro de viaje Japón', 'MAPFRE-78901', NULL, 'MAPFRE', '2025-09-15', '2025-09-24', NULL, NULL, NULL);

-- Gastos Tokio
INSERT INTO public.expenses (trip_id, category, description, amount, currency, date)
VALUES
  (v_trip1_id, 'Transporte', 'Billetes de avión (ida y vuelta)', 1200.00, 'EUR', '2025-06-01'),
  (v_trip1_id, 'Alojamiento', 'Park Hyatt Tokyo (6 noches)', 1800.00, 'EUR', '2025-06-01'),
  (v_trip1_id, 'Alojamiento', 'Ryokan Kioto (2 noches)', 380.00, 'EUR', '2025-06-01'),
  (v_trip1_id, 'Seguros', 'Seguro de viaje MAPFRE', 89.00, 'EUR', '2025-05-15');

-- Recordatorios Tokio
INSERT INTO public.reminders (trip_id, user_id, title, remind_at, type)
VALUES
  (v_trip1_id, v_user_id, 'Check-in online vuelo Iberia', '2025-09-13 10:00:00+02', 'checkin'),
  (v_trip1_id, v_user_id, '¡Faltan 7 días para Tokio!', '2025-09-08 09:00:00+02', 'trip_countdown'),
  (v_trip1_id, v_user_id, '¡Faltan 30 días para Tokio!', '2025-08-16 09:00:00+02', 'trip_countdown');

-- Packing Tokio
INSERT INTO public.packing_items (trip_id, category, name, is_checked, order_index)
VALUES
  (v_trip1_id, 'Documentación', 'Pasaporte (vigencia > 6 meses)', true, 0),
  (v_trip1_id, 'Documentación', 'Visado (no requerido para España)', true, 1),
  (v_trip1_id, 'Documentación', 'Seguro de viaje impreso', false, 2),
  (v_trip1_id, 'Documentación', 'Reservas de hotel', false, 3),
  (v_trip1_id, 'Tecnología', 'Adaptador de enchufe tipo A/B (Japón)', false, 0),
  (v_trip1_id, 'Tecnología', 'SIM card o eSIM Japón', false, 1),
  (v_trip1_id, 'Tecnología', 'Power bank', false, 2),
  (v_trip1_id, 'Ropa', 'Ropa transpirable (calor en sept)', false, 0),
  (v_trip1_id, 'Ropa', 'Paraguas plegable', false, 1),
  (v_trip1_id, 'Ropa', 'Zapatos cómodos para caminar', false, 2);

-- ============================================================
-- VIAJE 2: Roma
-- ============================================================
INSERT INTO public.trips (id, user_id, name, description, destination, start_date, end_date, status, budget_total, tags)
VALUES (
  v_trip2_id,
  v_user_id,
  'Roma Eterna',
  'Un fin de semana largo para perderse entre el Coliseo, la Fontana di Trevi y las mejores trattorias de Trastevere.',
  'Roma, Italia',
  '2025-11-20',
  '2025-11-23',
  'planning',
  800.00,
  ARRAY['Europa', 'Historia', 'Gastronomía', 'Arte']
);

-- Documentos Roma
INSERT INTO public.documents (trip_id, category, title, confirmation_number, locator, provider, datetime_start, datetime_end, origin, destination)
VALUES
  (v_trip2_id, 'flight', 'Vuelo Madrid → Roma Fiumicino', 'VY2456', 'ABCD12', 'Vueling', '2025-11-20 08:15:00+01', '2025-11-20 11:30:00+01', 'Madrid (MAD)', 'Roma Fiumicino (FCO)'),
  (v_trip2_id, 'hotel', 'Hotel Campo de Fiori', 'CAMP-33219', NULL, 'Hotel Campo de Fiori', '2025-11-20 14:00:00+01', '2025-11-23 11:00:00+01', NULL, NULL);

-- Gastos Roma
INSERT INTO public.expenses (trip_id, category, description, amount, currency, date)
VALUES
  (v_trip2_id, 'Transporte', 'Vuelo ida y vuelta', 180.00, 'EUR', '2025-09-10'),
  (v_trip2_id, 'Alojamiento', 'Hotel Campo de Fiori (3 noches)', 390.00, 'EUR', '2025-09-10');

-- Recordatorio Roma
INSERT INTO public.reminders (trip_id, user_id, title, remind_at, type)
VALUES
  (v_trip2_id, v_user_id, 'Reservar entradas al Coliseo', '2025-10-01 10:00:00+02', 'custom'),
  (v_trip2_id, v_user_id, 'Check-in vuelo Vueling', '2025-11-18 10:00:00+01', 'checkin');

END $$;
