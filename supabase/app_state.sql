-- Run in the Supabase SQL editor. Safe to rerun.
create table if not exists public.app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (pg_column_size(data) <= 10485760),
  updated_at timestamptz not null
);

alter table public.app_state enable row level security;

drop policy if exists "Users read their app state" on public.app_state;
create policy "Users read their app state"
  on public.app_state for select
  using (auth.uid() = user_id);

drop policy if exists "Users create their app state" on public.app_state;
create policy "Users create their app state"
  on public.app_state for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update their app state" on public.app_state;
create policy "Users update their app state"
  on public.app_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.app_state from anon;
grant select, insert, update on public.app_state to authenticated;
