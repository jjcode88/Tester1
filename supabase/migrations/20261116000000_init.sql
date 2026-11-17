-- Cadence schema.
--
-- Every table is owned per user and locked down with row-level security: the
-- browser talks to Postgres directly with a public key, so these policies ARE
-- the authorisation layer.
--
-- Sync model (see src/lib/sync.ts):
--   * updated_at         client clock, decides conflicts (last write wins)
--   * server_updated_at  server clock, orders the change feed devices pull from
--   * deleted_at         tombstone, so a deletion reaches every device

-- ── Tables ──────────────────────────────────────────────────────────────────

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  units text not null default 'kg' check (units in ('kg', 'lb')),
  weekly_goal smallint not null default 3 check (weekly_goal between 1 and 14),
  rest_seconds smallint not null default 120 check (rest_seconds between 0 and 3600),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default clock_timestamp()
);

comment on table public.profiles is 'Per-user training preferences. One row per account.';

create table public.workouts (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  started_at timestamptz not null,
  ended_at timestamptz check (ended_at is null or ended_at >= started_at),
  notes text not null default '' check (char_length(notes) <= 4000),
  -- [{ id, exerciseId, name, muscle, sets: [{ id, weightKg, reps, done }] }]
  exercises jsonb not null default '[]'::jsonb check (
    jsonb_typeof(exercises) = 'array' and pg_column_size(exercises) <= 262144
  ),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);

comment on table public.workouts is 'One row per training session; ended_at is null while in progress.';

create table public.body_metrics (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(5, 2) not null check (weight_kg > 0 and weight_kg < 500),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);

comment on table public.body_metrics is 'Body weight readings, one per user per day by convention.';

-- The change feed: "rows of mine changed after this point", in a stable order.
create index workouts_feed_idx on public.workouts (user_id, server_updated_at, id);
create index body_metrics_feed_idx on public.body_metrics (user_id, server_updated_at, id);
create index workouts_started_idx on public.workouts (user_id, started_at desc) where deleted_at is null;

-- ── Sync guard ──────────────────────────────────────────────────────────────

-- Runs before every write. A device that was offline may upload an edit older
-- than the one already stored; returning NULL skips that row, so the newer
-- version survives and the stale device receives it on its next pull.
create function public.sync_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  -- clock_timestamp() rather than now(): rows written in one statement get
  -- distinct, increasing stamps, which keeps the feed order unambiguous.
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger profiles_sync_guard before insert or update on public.profiles
  for each row execute function public.sync_guard();
create trigger workouts_sync_guard before insert or update on public.workouts
  for each row execute function public.sync_guard();
create trigger body_metrics_sync_guard before insert or update on public.body_metrics
  for each row execute function public.sync_guard();

-- ── Row-level security ──────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.workouts enable row level security;
alter table public.body_metrics enable row level security;

-- (select auth.uid()) is evaluated once per statement instead of once per row.
create policy "read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "create own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "read own workouts" on public.workouts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "create own workouts" on public.workouts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own workouts" on public.workouts
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "read own body metrics" on public.body_metrics
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "create own body metrics" on public.body_metrics
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own body metrics" on public.body_metrics
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- No DELETE policy on purpose: rows are tombstoned, never removed by clients.
-- Deleting the auth user cascades and removes everything they own.

revoke all on public.profiles, public.workouts, public.body_metrics from anon, authenticated;
grant select, insert, update on public.profiles, public.workouts, public.body_metrics to authenticated;

-- ── Reporting views ─────────────────────────────────────────────────────────

-- security_invoker makes the views obey the caller's RLS, so they are as
-- private as the tables underneath.
create view public.workout_sets
with (security_invoker = true) as
select
  w.user_id,
  w.id as workout_id,
  w.started_at,
  e.item ->> 'exerciseId' as exercise_id,
  e.item ->> 'name' as exercise_name,
  e.item ->> 'muscle' as muscle,
  (s.item ->> 'weightKg')::numeric as weight_kg,
  (s.item ->> 'reps')::integer as reps
from public.workouts w
cross join lateral jsonb_array_elements(w.exercises) as e (item)
cross join lateral jsonb_array_elements(coalesce(e.item -> 'sets', '[]'::jsonb)) as s (item)
where w.deleted_at is null
  and w.ended_at is not null
  and (s.item ->> 'done')::boolean
  and (s.item ->> 'reps')::integer > 0;

comment on view public.workout_sets is 'One row per completed set, unpacked from workouts.exercises.';

create view public.weekly_volume
with (security_invoker = true) as
select
  user_id,
  date_trunc('week', started_at)::date as week_start,
  count(distinct workout_id) as workouts,
  count(*) as sets,
  sum(weight_kg * reps) as volume_kg
from public.workout_sets
group by user_id, date_trunc('week', started_at);

comment on view public.weekly_volume is 'Sessions, sets and lifted volume per ISO week.';

revoke all on public.workout_sets, public.weekly_volume from anon, authenticated;
grant select on public.workout_sets, public.weekly_volume to authenticated;
