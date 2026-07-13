-- Run once in the Supabase SQL editor. Safe to run again.
create table if not exists public.app_recovery_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  created_at timestamptz not null,
  reason text not null check (reason in (
    'automatic',
    'manual',
    'before-workout-edit',
    'before-workout-delete',
    'before-import',
    'before-reset',
    'before-restore',
    'before-cloud-replace'
  )),
  data_hash text not null check (char_length(data_hash) between 1 and 100),
  data jsonb not null check (pg_column_size(data) <= 10485760),
  primary key (user_id, id)
);

alter table public.app_recovery_snapshots enable row level security;

drop policy if exists "Users read their recovery copies" on public.app_recovery_snapshots;
create policy "Users read their recovery copies"
  on public.app_recovery_snapshots for select
  using (auth.uid() = user_id);

drop policy if exists "Users create their recovery copies" on public.app_recovery_snapshots;
create policy "Users create their recovery copies"
  on public.app_recovery_snapshots for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update their recovery copies" on public.app_recovery_snapshots;
create policy "Users update their recovery copies"
  on public.app_recovery_snapshots for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete their recovery copies" on public.app_recovery_snapshots;
create policy "Users delete their recovery copies"
  on public.app_recovery_snapshots for delete
  using (auth.uid() = user_id);

revoke all on public.app_recovery_snapshots from anon;
grant select, insert, update, delete on public.app_recovery_snapshots to authenticated;

create or replace function public.trim_app_recovery_snapshots()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.app_recovery_snapshots
  where user_id = new.user_id
    and id in (
      select id
      from public.app_recovery_snapshots
      where user_id = new.user_id
      order by created_at desc, id desc
      offset 3
    );
  return new;
end;
$$;

revoke all on function public.trim_app_recovery_snapshots() from public;

drop trigger if exists trim_app_recovery_snapshots_after_write on public.app_recovery_snapshots;
create trigger trim_app_recovery_snapshots_after_write
after insert or update on public.app_recovery_snapshots
for each row execute function public.trim_app_recovery_snapshots();

-- Deletion records stop a copy removed on one device from returning when an offline device reconnects.
create table if not exists public.app_recovery_deletions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  deleted_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.app_recovery_deletions enable row level security;

drop policy if exists "Users read their recovery deletions" on public.app_recovery_deletions;
create policy "Users read their recovery deletions"
  on public.app_recovery_deletions for select
  using (auth.uid() = user_id);

drop policy if exists "Users create their recovery deletions" on public.app_recovery_deletions;
create policy "Users create their recovery deletions"
  on public.app_recovery_deletions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update their recovery deletions" on public.app_recovery_deletions;
create policy "Users update their recovery deletions"
  on public.app_recovery_deletions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.app_recovery_deletions from anon;
grant select, insert, update on public.app_recovery_deletions to authenticated;

create or replace function public.trim_app_recovery_deletions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.app_recovery_deletions
  where user_id = new.user_id
    and id in (
      select id
      from public.app_recovery_deletions
      where user_id = new.user_id
      order by deleted_at desc, id desc
      offset 20
    );
  return new;
end;
$$;

revoke all on function public.trim_app_recovery_deletions() from public;

drop trigger if exists trim_app_recovery_deletions_after_write on public.app_recovery_deletions;
create trigger trim_app_recovery_deletions_after_write
after insert or update on public.app_recovery_deletions
for each row execute function public.trim_app_recovery_deletions();
