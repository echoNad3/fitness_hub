-- Run in the Supabase SQL editor. Safe to rerun.
create table if not exists public.app_recovery_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  created_at timestamptz not null,
  reason text not null check (reason in (
    'automatic',
    'manual',
    'before-workout-edit',
    'before-workout-delete',
    'before-program-change',
    'before-import',
    'before-reset',
    'before-restore',
    'before-cloud-replace'
  )),
  data_hash text not null check (char_length(data_hash) between 1 and 100),
  data jsonb not null check (pg_column_size(data) <= 10485760),
  retention text check (retention in ('protected', 'rolling')),
  primary key (user_id, id)
);

-- Existing protected copies keep their original retention. Only new routine copies rotate.
alter table public.app_recovery_snapshots
  add column if not exists retention text
    check (retention in ('protected', 'rolling'));

-- Keep the reason constraint current when this script is rerun on an existing project.
alter table public.app_recovery_snapshots
  drop constraint if exists app_recovery_snapshots_reason_check;
alter table public.app_recovery_snapshots
  add constraint app_recovery_snapshots_reason_check check (reason in (
    'automatic',
    'manual',
    'before-workout-edit',
    'before-workout-delete',
    'before-program-change',
    'before-import',
    'before-reset',
    'before-restore',
    'before-cloud-replace'
  ));

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
  -- Manual/legacy protected rows are never removed by automatic retention.
  -- Record every pruned id so an offline device cannot upload it again.
  with candidates as (
    select id, reason, created_at, pg_column_size(data) as bytes,
      row_number() over (partition by reason order by created_at desc, id asc) as reason_position
    from public.app_recovery_snapshots
    where user_id = new.user_id and reason <> 'manual'
      and (retention = 'rolling' or (retention is null and reason = 'automatic'))
  ), ranked as (
    select id,
      row_number() over (order by created_at desc, id asc) as position,
      sum(bytes) over (order by created_at desc, id asc) as total_bytes
    from candidates where reason <> 'automatic' or reason_position <= 3
  ), removed as (
    delete from public.app_recovery_snapshots
    where user_id = new.user_id and id in (
      select id from ranked where position > 20 or total_bytes > 20971520
      union all select id from candidates where reason = 'automatic' and reason_position > 3
    ) returning user_id, id
  )
  insert into public.app_recovery_deletions(user_id, id, deleted_at)
    select user_id, id, now() from removed
    on conflict (user_id, id) do nothing;
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

-- Tombstones must outlive every offline device that can still hold a deleted recovery copy.
-- Earlier versions kept only 20, which could let an old copy return after enough later deletions.
drop trigger if exists trim_app_recovery_deletions_after_write on public.app_recovery_deletions;
drop function if exists public.trim_app_recovery_deletions();

-- Enforce deletion at the source, including uploads from old/offline app versions.
create or replace function public.prevent_deleted_recovery_copy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reason = 'manual' then
    new.retention := 'protected';
  elsif tg_op = 'UPDATE' and old.retention = 'protected' then
    -- Older clients omit retention on upsert. They must not unpin a protected copy.
    new.retention := 'protected';
  end if;
  if exists (select 1 from public.app_recovery_deletions where user_id = new.user_id and id = new.id) then
    return null;
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_deleted_recovery_copy() from public;
drop trigger if exists prevent_deleted_recovery_copy_before_write on public.app_recovery_snapshots;
create trigger prevent_deleted_recovery_copy_before_write
before insert or update on public.app_recovery_snapshots
for each row execute function public.prevent_deleted_recovery_copy();
