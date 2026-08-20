# Wanderlog

Tu diario de viajes personal — planifica, organiza y recuerda cada aventura desde cualquier dispositivo.

## Stack

- **Frontend**: React 19 + TypeScript (strict) + Vite 8 + Tailwind CSS v4 + shadcn/ui
- **Estado**: Zustand v5 + TanStack Query v5 (con persistencia offline)
- **Backend**: Supabase (PostgreSQL + Auth + Storage + RLS + Realtime + Edge Functions)
- **Auth**: Google OAuth (un clic, sin contraseña)
- **Mapas**: Google Maps JavaScript API + Places API (@vis.gl/react-google-maps)
- **UI**: Framer Motion, Recharts, @dnd-kit, FullCalendar v6, date-fns v4
- **PWA**: vite-plugin-pwa + Workbox (instalable, modo offline, notificaciones push)

---

## Configuración completa paso a paso

### 1. Crear proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) → New Project
2. Elige una región cercana (EU West para España)
3. Guarda la **URL** y la **clave anon** (Settings → API)

### 2. Configurar Google OAuth en Supabase

1. Ve a **Authentication → Providers → Google**
2. Activa Google
3. Ve a [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
4. Crea un **OAuth 2.0 Client ID** de tipo "Web application"
5. En **Authorized redirect URIs** añade:
   ```
   https://tu-proyecto.supabase.co/auth/v1/callback
   ```
6. Copia el **Client ID** y **Client Secret** de vuelta a Supabase → Google Provider

### 3. Obtener Google Maps API Key

1. En [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Crea una **API Key**
3. Activa estos servicios en "Library":
   - Maps JavaScript API
   - Places API
4. En la API Key → Application restrictions → HTTP referrers:
   ```
   http://localhost:5173/*
   https://tu-dominio.com/*
   ```

### 4. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con tus valores reales:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_GOOGLE_MAPS_BROWSER_KEY=AIzaSy...
```

La clave del navegador va restringida por referrer (tu dominio + `localhost:5173`)
y solo con Maps JavaScript, Places API (New), Geocoding y Directions. La clave del
servidor (`GOOGLE_MAPS_SERVER_KEY`, para las Edge Functions) no se pone aquí: se
sube como secreto de Supabase.

### 5. Ejecutar migraciones SQL

En Supabase → **SQL Editor**, ejecuta en este orden:

```
supabase/migrations/001_initial_schema.sql   ← esquema completo + RLS + Storage
supabase/migrations/002_seed_example.sql     ← datos de ejemplo (edita YOUR_USER_ID)
```

Alternativamente con Supabase CLI:
```bash
npx supabase db push
```

### 6. Arrancar en local

```bash
npm install
npm run dev
```

Abre http://localhost:5173 y haz clic en "Continuar con Google".

---

## Estructura del proyecto

```
src/
├── components/
│   ├── ui/              # shadcn/ui
│   ├── layout/          # Sidebar, BottomNav, AppLayout, ProtectedRoute
│   ├── trips/           # TripCard, TripFormDialog, compartir, offline
│   ├── itinerary/       # bloques de actividad, alertas de día, diario
│   ├── documents/       # escaneo de DNI, visores
│   └── places/          # lugares guardados
├── pages/               # Login, Dashboard, TripDetail, Itinerary,
│                        # AudioguidePage, MapView, Documents, GuidePage,
│                        # ExpensesPage, PackingPage, RemindersPage,
│                        # TripMemoryPage, CalendarPage, Settings...
├── store/               # authStore, a11yStore (Zustand)
├── lib/
│   ├── supabase.ts      # Cliente Supabase tipado
│   ├── queries/         # TanStack Query hooks por dominio (18 módulos)
│   ├── audioguide/      # prompt IA, parseo del guion, proveedores
│   ├── realtime/        # escucha de audioguía sincronizada en grupo
│   ├── offline.ts       # outbox de cambios hechos sin conexión
│   ├── maps.ts          # Helpers Google Maps + estilos dark
│   └── utils.ts         # cn(), formatDate(), formatCurrency(), generateICS()...
├── hooks/               # useAuth, usePwaInstall
├── sw.ts                # Service Worker (Workbox): precache + offline + push
└── types/               # database.ts (tipos del esquema Supabase)

supabase/
├── migrations/          # Esquema completo + RLS + Storage (31 migraciones)
└── functions/
    ├── audioguide-tts/  # Google Cloud TTS: guion → MP3 por paradas, subido a R2
    ├── audioguide-media/# Borra de R2 los audios de una audioguía o de un viaje
    ├── revolut-connect/ # Conexión bancaria (GoCardless/Nordigen)
    ├── revolut-sync/    # Importación de movimientos como gastos
    ├── flight-status/   # Estado real del vuelo (AeroDataBox); opcional
    └── send-reminders/  # Cron horario para emails de avisos
```

---

## Funcionalidades

| Módulo | Descripción |
|--------|-------------|
| **Auth** | Google OAuth, sesión persistente, RLS por usuario |
| **Dashboard** | Cards de viajes con foto, countdown, filtros, panel de avisos |
| **Viajes** | CRUD completo, portada en Storage, compartir con colaboradores |
| **Itinerario** | Timeline por días, drag & drop con @dnd-kit, clima, alertas de día |
| **Audioguías** | Guion con IA (prompt copy-paste) + Google TTS por paradas + escucha sincronizada en grupo (Realtime) |
| **Mapa** | Google Maps + Places Autocomplete, lugares guardados, recorrido del viaje |
| **Guía del destino** | Borrador automático con Wikipedia/Wikivoyage, editable en Markdown |
| **Documentos** | Cartera de viaje: vuelos, hoteles, seguros, DNIs con escaneo automático |
| **Calendario** | FullCalendar con todos los viajes, export .ics |
| **Avisos** | Notificaciones push + Edge Function para emails |
| **Equipaje** | Checklist por categorías, plantillas reutilizables |
| **Gastos** | Reparto entre viajeros, multi-divisa con conversión, gráficos, importación bancaria (Revolut) |
| **Recuerdos** | Diario y fotos por día, vista imprimible a PDF |
| **Vuelos** | Estado real el día del vuelo: retraso, terminal y puerta (opcional, ver Edge Functions) |
| **Offline** | PWA instalable: caché persistente + outbox (gastos, diario, actividades hechas y equipaje) |

---

## Despliegue

### Netlify

El repo incluye `netlify.toml` (build, SPA fallback y excepciones del escáner
de secretos). Conecta el repo en Netlify y configura las variables `VITE_*`
en Site settings → Environment variables.

### Edge Functions

```bash
npx supabase functions deploy audioguide-tts     # TTS de audioguías (GOOGLE_TTS_API_KEY + R2_*)
npx supabase functions deploy audioguide-media   # Borrado de los audios en R2 (R2_*)
npx supabase functions deploy revolut-connect  # Conexión bancaria (GoCardless)
npx supabase functions deploy revolut-sync
npx supabase functions deploy send-reminders
npx supabase functions deploy flight-status    # Estado real del vuelo (opcional)
# Cron send-reminders: 0 * * * * (cada hora) en Supabase → Edge Functions → Schedules
npx supabase functions deploy send-trip-invite  # Correo al compartir un viaje
```

**Estado del vuelo** (`flight-status`): usa el número de vuelo que ya guarda la
reserva para enseñar retraso, terminal y puerta el día que vuelas — en el bloque
"Hoy" del viaje y en el detalle de la actividad. Es **opcional**: sin el secreto
la función responde 501 y la tarjeta simplemente no aparece, sin romper nada.

```bash
npx supabase secrets set AERODATABOX_RAPIDAPI_KEY=xxxxxxxx
```

La clave es gratis en [rapidapi.com/aedbx-aedbx/api/aerodatabox](https://rapidapi.com/aedbx-aedbx/api/aerodatabox)
(capa gratuita con cuota mensual). Para no gastarla, solo se consulta entre el
día anterior y dos días después del vuelo, y se refresca cada 5 minutos
únicamente el día del vuelo.

**Correo de invitación** (`send-trip-invite`): sale por SMTP de Gmail, así que no
hace falta dominio propio ni proveedor de pago. Requiere una *contraseña de
aplicación* de Google (myaccount.google.com → Seguridad → Contraseñas de
aplicaciones; solo aparece con la verificación en 2 pasos activada):

```bash
npx supabase secrets set GMAIL_USER=tu@gmail.com
npx supabase secrets set GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
npx supabase secrets set APP_URL=https://tu-dominio   # base de los enlaces del correo
```

El correo lleva a `/invite/<token>`, una ruta **pública**: quien no tiene cuenta
ve el viaje al que le invitan y se registra ahí mismo (Google o enlace mágico),
y al volver entra directo al viaje. El enlace caduca a los 30 días y se puede
compartir también a mano desde la lista de colaboradores.

---

## Seguridad

- Toda la base de datos protegida con **Row Level Security (RLS)**
- Cada usuario solo accede a sus propios datos
- Storage de Supabase con políticas por carpeta `userId/`
- El audio de las audioguías vive en Cloudflare R2, donde no hay RLS: quien
  autoriza es la Edge Function, comprobando `can_edit_trip` sobre el viaje de la
  parada. El bucket es de lectura pública y de escritura solo con credenciales
  que nunca salen del servidor. Ver `scripts/README.md`.
- Auth exclusivamente via OAuth (sin contraseñas)
