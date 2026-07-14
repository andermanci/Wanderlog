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
    ├── audioguide-tts/  # Google Cloud TTS: guion → MP3 por paradas
    ├── revolut-connect/ # Conexión bancaria (GoCardless/Nordigen)
    ├── revolut-sync/    # Importación de movimientos como gastos
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
| **Offline** | PWA instalable: caché persistente + outbox de cambios sin conexión |

---

## Despliegue

### Netlify

El repo incluye `netlify.toml` (build, SPA fallback y excepciones del escáner
de secretos). Conecta el repo en Netlify y configura las variables `VITE_*`
en Site settings → Environment variables.

### Edge Functions

```bash
npx supabase functions deploy audioguide-tts   # TTS de audioguías (requiere GOOGLE_TTS_API_KEY)
npx supabase functions deploy revolut-connect  # Conexión bancaria (GoCardless)
npx supabase functions deploy revolut-sync
npx supabase functions deploy send-reminders
# Cron send-reminders: 0 * * * * (cada hora) en Supabase → Edge Functions → Schedules
```

---

## Seguridad

- Toda la base de datos protegida con **Row Level Security (RLS)**
- Cada usuario solo accede a sus propios datos
- Storage con políticas por carpeta `userId/`
- Auth exclusivamente via OAuth (sin contraseñas)
