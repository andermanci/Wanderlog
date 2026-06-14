-- ============================================================
-- WANDERLOG - Suscripciones de notificaciones push (Web Push)
-- ============================================================
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_select" on public.push_subscriptions;
drop policy if exists "push_insert" on public.push_subscriptions;
drop policy if exists "push_update" on public.push_subscriptions;
drop policy if exists "push_delete" on public.push_subscriptions;

create policy "push_select" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push_insert" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "push_update" on public.push_subscriptions
  for update using (auth.uid() = user_id);
create policy "push_delete" on public.push_subscriptions
  for delete using (auth.uid() = user_id);
