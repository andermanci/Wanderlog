# Wanderlog

Tu diario de viajes personal — planifica, organiza y recuerda cada aventura desde cualquier dispositivo.

## Stack

- **Frontend**: React 19 + TypeScript (strict) + Vite 6 + Tailwind CSS v4 + shadcn/ui
- **Estado**: Zustand v5 + TanStack Query v5
- **Backend**: Supabase (PostgreSQL + Auth + Storage + RLS)
- **Auth**: Google OAuth (un clic, sin contraseña)
- **Mapas**: Google Maps JavaScript API + Places API (@vis.gl/react-google-maps)
- **UI**: Framer Motion, Recharts, @dnd-kit, FullCalendar v6, date-fns v4

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
VITE_GOOGLE_MAPS_API_KEY=AIzaSy...
```

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
│   ├── layout/          # Sidebar, AppLayout, ProtectedRoute
│   ├── trips/           # TripCard, TripFormDialog
│   └── itinerary/       # ActivityBlock, ActivityFormDialog
├── pages/               # Login, Dashboard, TripDetail, Itinerary,
│                        # MapView, Documents, CalendarPage,
│                        # RemindersPage, PackingPage, ExpensesPage, Settings
├── store/               # authStore (Zustand)
├── lib/
│   ├── supabase.ts      # Cliente Supabase tipado
│   ├── queries/         # TanStack Query hooks por dominio
│   ├── maps.ts          # Helpers Google Maps + estilos dark
│   └── utils.ts         # cn(), formatDate(), formatCurrency(), generateICS()...
├── hooks/               # useAuth.ts
└── types/               # database.ts (tipos del esquema Supabase)

supabase/
├── migrations/
│   ├── 001_initial_schema.sql  # Esquema completo + RLS + Storage
│   └── 002_seed_example.sql    # Datos de ejemplo
└── functions/
    └── send-reminders/         # Edge Function cron para emails
```

---

## Funcionalidades

| Módulo | Descripción |
|--------|-------------|
| **Auth** | Google OAuth, sesión persistente, RLS por usuario |
| **Dashboard** | Cards de viajes con foto, countdown, filtros, panel de avisos |
| **Viajes** | CRUD completo, subida de portada a Supabase Storage |
| **Itinerario** | Timeline por días, drag & drop con @dnd-kit |
| **Mapa** | Google Maps + Places Autocomplete, favoritos por viaje |
| **Documentos** | Cartera de viaje: vuelos, hoteles, seguros, adjuntos |
| **Calendario** | FullCalendar con todos los viajes, export .ics |
| **Avisos** | Web Notifications API + Edge Function para emails |
| **Equipaje** | Checklist por categorías, plantillas reutilizables |
| **Gastos** | Registro con gráfico Recharts, control presupuesto |

---

## Despliegue

### Vercel

```bash
npm i -g vercel && vercel
```

Configura las variables de entorno en Vercel → Settings → Environment Variables.

### Edge Function (recordatorios email)

```bash
npx supabase functions deploy send-reminders
# Cron: 0 * * * * (cada hora) en Supabase → Edge Functions → Schedules
```

---

## Seguridad

- Toda la base de datos protegida con **Row Level Security (RLS)**
- Cada usuario solo accede a sus propios datos
- Storage con políticas por carpeta `userId/`
- Auth exclusivamente via OAuth (sin contraseñas)
