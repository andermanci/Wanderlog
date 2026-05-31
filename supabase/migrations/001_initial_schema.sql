-- ============================================================
-- WANDERLOG - Migración inicial completa
-- ============================================================

-- Extensiones necesarias
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLA: profiles
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  default_currency text not null default 'EUR',
  created_at timestamptz not null default now()
);

-- Trigger: crear perfil automáticamente al registrar usuario
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- TABLA: trips
-- ============================================================
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  destination text not null,
  start_date date not null,
  end_date date not null,
  cover_image_url text,
  status text not null default 'planning'
    check (status in ('planning','confirmed','in_progress','completed')),
  budget_total numeric(12,2),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint trips_dates_check check (end_date >= start_date)
);

create index if not exists idx_trips_user_id on public.trips(user_id);
create index if not exists idx_trips_status on public.trips(status);
create index if not exists idx_trips_start_date on public.trips(start_date);

-- ============================================================
-- TABLA: itinerary_days
-- ============================================================
create table if not exists public.itinerary_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  date date not null,
  notes text,
  unique(trip_id, date)
);

create index if not exists idx_itinerary_days_trip_id on public.itinerary_days(trip_id);

-- ============================================================
-- TABLA: activities
-- ============================================================
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  day_id uuid not null references public.itinerary_days(id) on delete cascade,
  type text not null default 'other'
    check (type in ('flight','hotel','restaurant','activity','transport','place','other')),
  title text not null,
  description text,
  address text,
  start_time time,
  end_time time,
  price numeric(12,2),
  external_link text,
  notes text,
  order_index integer not null default 0,
  place_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_activities_trip_id on public.activities(trip_id);
create index if not exists idx_activities_day_id on public.activities(day_id);
create index if not exists idx_activities_order on public.activities(day_id, order_index);

-- ============================================================
-- TABLA: documents
-- ============================================================
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  category text not null default 'other'
    check (category in ('flight','train','bus','hotel','car_rental','transfer','tour','ticket','insurance','other')),
  title text not null,
  confirmation_number text,
  locator text,
  provider text,
  link text,
  datetime_start timestamptz,
  datetime_end timestamptz,
  origin text,
  destination text,
  seat text,
  phone text,
  file_url text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_documents_trip_id on public.documents(trip_id);
create index if not exists idx_documents_category on public.documents(category);
create index if not exists idx_documents_datetime on public.documents(datetime_start);

-- ============================================================
-- TABLA: favorite_places
-- ============================================================
create table if not exists public.favorite_places (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  google_place_id text not null,
  name text not null,
  address text,
  lat numeric(10,7) not null,
  lng numeric(10,7) not null,
  category text not null default 'other'
    check (category in ('restaurant','hotel','attraction','cafe','bar','shop','other')),
  rating numeric(3,1),
  notes text,
  link text,
  created_at timestamptz not null default now()
);

create index if not exists idx_favorite_places_trip_id on public.favorite_places(trip_id);
create index if not exists idx_favorite_places_user_id on public.favorite_places(user_id);
create index if not exists idx_favorite_places_category on public.favorite_places(category);

-- ============================================================
-- TABLA: reminders
-- ============================================================
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  remind_at timestamptz not null,
  type text not null default 'custom'
    check (type in ('trip_countdown','flight','checkin','document_expiry','custom')),
  is_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_reminders_user_id on public.reminders(user_id);
create index if not exists idx_reminders_trip_id on public.reminders(trip_id);
create index if not exists idx_reminders_remind_at on public.reminders(remind_at) where not is_sent;

-- ============================================================
-- TABLA: packing_items
-- ============================================================
create table if not exists public.packing_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  category text not null default 'General',
  name text not null,
  is_checked boolean not null default false,
  order_index integer not null default 0
);

create index if not exists idx_packing_items_trip_id on public.packing_items(trip_id);

-- ============================================================
-- TABLA: expenses
-- ============================================================
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  category text not null default 'Otros',
  description text not null,
  amount numeric(12,2) not null,
  currency text not null default 'EUR',
  date date not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_expenses_trip_id on public.expenses(trip_id);
create index if not exists idx_expenses_date on public.expenses(date);
create index if not exists idx_expenses_category on public.expenses(category);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.itinerary_days enable row level security;
alter table public.activities enable row level security;
alter table public.documents enable row level security;
alter table public.favorite_places enable row level security;
alter table public.reminders enable row level security;
alter table public.packing_items enable row level security;
alter table public.expenses enable row level security;

-- PROFILES
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- TRIPS
drop policy if exists "trips_all_own" on public.trips;
create policy "trips_select_own" on public.trips
  for select using (auth.uid() = user_id);
create policy "trips_insert_own" on public.trips
  for insert with check (auth.uid() = user_id);
create policy "trips_update_own" on public.trips
  for update using (auth.uid() = user_id);
create policy "trips_delete_own" on public.trips
  for delete using (auth.uid() = user_id);

-- ITINERARY_DAYS (acceso vía trip_id que pertenece al usuario)
create policy "itinerary_days_select" on public.itinerary_days
  for select using (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
create policy "itinerary_days_insert" on public.itinerary_days
  for insert with check (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
create policy "itinerary_days_update" on public.itinerary_days
  for update using (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
create policy "itinerary_days_delete" on public.itinerary_days
  for delete using (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );

-- ACTIVITIES
create policy "activities_select" on public.activities
  for select using (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
create policy "activities_insert" on public.activities
  for insert with check (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
create policy "activities_update" on public.activities
  for update using (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
create policy "activities_delete" on public.activities
  for delete using (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );

-- DOCUMENTS
create policy "documents_select" on public.documents
  for select using (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
create policy "documents_insert" on public.documents
  for insert with check (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
create policy "documents_update" on public.documents
  for update using (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
create policy "documents_delete" on public.documents
  for delete using (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );

-- FAVORITE_PLACES
create policy "favorite_places_select" on public.favorite_places
  for select using (auth.uid() = user_id);
create policy "favorite_places_insert" on public.favorite_places
  for insert with check (auth.uid() = user_id);
create policy "favorite_places_update" on public.favorite_places
  for update using (auth.uid() = user_id);
create policy "favorite_places_delete" on public.favorite_places
  for delete using (auth.uid() = user_id);

-- REMINDERS
create policy "reminders_select" on public.reminders
  for select using (auth.uid() = user_id);
create policy "reminders_insert" on public.reminders
  for insert with check (auth.uid() = user_id);
create policy "reminders_update" on public.reminders
  for update using (auth.uid() = user_id);
create policy "reminders_delete" on public.reminders
  for delete using (auth.uid() = user_id);

-- PACKING_ITEMS
create policy "packing_select" on public.packing_items
  for select using (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
create policy "packing_insert" on public.packing_items
  for insert with check (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
create policy "packing_update" on public.packing_items
  for update using (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
create policy "packing_delete" on public.packing_items
  for delete using (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );

-- EXPENSES
create policy "expenses_select" on public.expenses
  for select using (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
create policy "expenses_insert" on public.expenses
  for insert with check (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
create policy "expenses_update" on public.expenses
  for update using (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
create policy "expenses_delete" on public.expenses
  for delete using (
    exists (select 1 from public.trips where trips.id = trip_id and trips.user_id = auth.uid())
  );

-- ============================================================
-- STORAGE: buckets
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('trip-covers', 'trip-covers', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('documents', 'documents', false, 10485760, array['image/jpeg','image/png','application/pdf']),
  ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Storage policies
create policy "trip_covers_select" on storage.objects
  for select using (bucket_id = 'trip-covers');
create policy "trip_covers_insert" on storage.objects
  for insert with check (bucket_id = 'trip-covers' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "trip_covers_update" on storage.objects
  for update using (bucket_id = 'trip-covers' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "trip_covers_delete" on storage.objects
  for delete using (bucket_id = 'trip-covers' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "documents_storage_select" on storage.objects
  for select using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "documents_storage_insert" on storage.objects
  for insert with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "documents_storage_update" on storage.objects
  for update using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "documents_storage_delete" on storage.objects
  for delete using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "avatars_select" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "avatars_insert" on storage.objects
  for insert with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "avatars_update" on storage.objects
  for update using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
