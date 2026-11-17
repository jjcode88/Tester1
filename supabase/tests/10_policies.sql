-- Behavioural tests for the schema: row-level security, the sync guard and the
-- reporting views. Plain SQL with ASSERT so it runs anywhere psql does — the
-- local stub database and a real Supabase stack alike.
--
-- Everything happens in one transaction that is rolled back at the end.

begin;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'ada@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'ben@example.test');

-- Act as a signed-in user for the rest of the transaction.
create function pg_temp.sign_in(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
end $$;

create function pg_temp.sign_out() returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

grant execute on all functions in schema pg_temp to anon, authenticated;

-- ── Ada writes her data ─────────────────────────────────────────────────────
select pg_temp.sign_in('11111111-1111-4111-8111-111111111111');

insert into public.workouts (id, name, started_at, ended_at, exercises, updated_at) values (
  'aaaaaaaa-0000-4000-8000-000000000001', 'Push',
  '2026-11-09T18:00:00Z', '2026-11-09T19:00:00Z',
  '[{"id":"e1","exerciseId":"bench-press","name":"Bench press","muscle":"chest","sets":[
      {"id":"s1","weightKg":80,"reps":5,"done":true},
      {"id":"s2","weightKg":80,"reps":5,"done":true},
      {"id":"s3","weightKg":80,"reps":4,"done":false}]},
    {"id":"e2","exerciseId":"pull-up","name":"Pull-up","muscle":"back","sets":[
      {"id":"s4","weightKg":0,"reps":10,"done":true}]}]',
  '2026-11-09T19:00:00Z'
);
insert into public.body_metrics (id, measured_on, weight_kg, updated_at)
  values ('bbbbbbbb-0000-4000-8000-000000000001', '2026-11-09', 82.4, '2026-11-09T07:00:00Z');
insert into public.profiles (units, weekly_goal) values ('lb', 4);

do $$
begin
  assert (select user_id from public.workouts) = '11111111-1111-4111-8111-111111111111',
    'user_id should default to the signed-in user';
  assert (select count(*) from public.workouts) = 1, 'Ada should see her workout';
  assert (select user_id from public.profiles) = '11111111-1111-4111-8111-111111111111',
    'profile should belong to the signed-in user';
end $$;

-- ── Ben cannot see or touch it ──────────────────────────────────────────────
select pg_temp.sign_in('22222222-2222-4222-8222-222222222222');

do $$
declare
  touched integer;
begin
  assert (select count(*) from public.workouts) = 0, 'Ben must not see Ada''s workouts';
  assert (select count(*) from public.body_metrics) = 0, 'Ben must not see Ada''s body metrics';
  assert (select count(*) from public.profiles) = 0, 'Ben must not see Ada''s profile';
  assert (select count(*) from public.workout_sets) = 0, 'views must not leak across users';
  assert (select count(*) from public.weekly_volume) = 0, 'views must not leak across users';

  update public.workouts set name = 'hijacked' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
  get diagnostics touched = row_count;
  assert touched = 0, 'Ben must not update Ada''s workout';

  -- Writing a row on someone else's behalf is refused outright.
  begin
    insert into public.workouts (id, user_id, name, started_at, updated_at)
      values ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'forged', now(), now());
    assert false, 'inserting for another user should fail';
  exception when insufficient_privilege then null;
  end;

  -- So is taking over an existing id through an upsert.
  begin
    insert into public.workouts (id, name, started_at, updated_at)
      values ('aaaaaaaa-0000-4000-8000-000000000001', 'takeover', now(), now())
      on conflict (id) do update set name = excluded.name, updated_at = excluded.updated_at;
    assert false, 'upserting over another user''s row should fail';
  exception when insufficient_privilege then null;
  end;

  -- Clients never hard-delete.
  begin
    delete from public.workouts;
    assert false, 'DELETE should not be granted';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Ben's own data lives alongside without interference.
insert into public.workouts (id, name, started_at, ended_at, exercises, updated_at) values (
  'cccccccc-0000-4000-8000-000000000001', 'Legs', '2026-11-10T18:00:00Z', '2026-11-10T19:00:00Z',
  '[{"id":"e1","exerciseId":"squat","name":"Back squat","muscle":"legs","sets":[{"id":"s1","weightKg":100,"reps":5,"done":true}]}]',
  '2026-11-10T19:00:00Z'
);

-- ── Signed-out visitors get nothing ─────────────────────────────────────────
select pg_temp.sign_out();

do $$
begin
  begin
    perform count(*) from public.workouts;
    assert false, 'anon should have no access to workouts';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.weekly_volume;
    assert false, 'anon should have no access to views';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── Sync guard ──────────────────────────────────────────────────────────────
select pg_temp.sign_in('11111111-1111-4111-8111-111111111111');

do $$
declare
  before_stamp timestamptz;
  after_stamp timestamptz;
begin
  select server_updated_at into before_stamp from public.workouts where id = 'aaaaaaaa-0000-4000-8000-000000000001';

  -- A stale upload (older updated_at) is skipped without an error.
  insert into public.workouts (id, name, started_at, updated_at)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'stale edit', '2026-11-09T18:00:00Z', '2026-11-09T18:30:00Z')
    on conflict (id) do update set name = excluded.name, updated_at = excluded.updated_at;
  assert (select name from public.workouts where id = 'aaaaaaaa-0000-4000-8000-000000000001') = 'Push',
    'a stale write must not replace a newer row';
  assert (select server_updated_at from public.workouts where id = 'aaaaaaaa-0000-4000-8000-000000000001') = before_stamp,
    'a skipped write must not move the row in the change feed';

  -- A newer upload wins and moves the row forward in the feed.
  insert into public.workouts (id, name, started_at, updated_at)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'Push day', '2026-11-09T18:00:00Z', '2026-11-09T20:00:00Z')
    on conflict (id) do update set name = excluded.name, updated_at = excluded.updated_at;
  select server_updated_at into after_stamp from public.workouts where id = 'aaaaaaaa-0000-4000-8000-000000000001';
  assert (select name from public.workouts where id = 'aaaaaaaa-0000-4000-8000-000000000001') = 'Push day',
    'a newer write should be applied';
  assert after_stamp > before_stamp, 'an applied write should advance server_updated_at';

  -- Clients cannot choose their own position in the feed.
  update public.workouts set server_updated_at = '2000-01-01', updated_at = '2026-11-09T21:00:00Z'
    where id = 'aaaaaaaa-0000-4000-8000-000000000001';
  assert (select server_updated_at from public.workouts where id = 'aaaaaaaa-0000-4000-8000-000000000001') > after_stamp,
    'server_updated_at is always set by the server';
end $$;

-- Rows written in a single statement still get distinct, ordered stamps.
insert into public.body_metrics (id, measured_on, weight_kg, updated_at)
select
  ('bbbbbbbb-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid,
  date '2026-10-01' + n, 82, now()
from generate_series(1, 25) as n;

do $$
begin
  assert (select count(distinct server_updated_at) from public.body_metrics) = 26,
    'bulk writes should receive distinct server stamps';
end $$;

-- ── Constraints ─────────────────────────────────────────────────────────────
do $$
begin
  begin
    insert into public.body_metrics (id, measured_on, weight_kg, updated_at)
      values ('bbbbbbbb-0000-4000-8000-000000000999', '2026-11-01', -3, now());
    assert false, 'negative body weight should be rejected';
  exception when check_violation then null;
  end;
  begin
    insert into public.workouts (id, name, started_at, exercises, updated_at)
      values ('aaaaaaaa-0000-4000-8000-000000000998', 'bad', now(), '{"not":"an array"}', now());
    assert false, 'exercises must be a JSON array';
  exception when check_violation then null;
  end;
  begin
    insert into public.workouts (id, name, started_at, ended_at, updated_at)
      values ('aaaaaaaa-0000-4000-8000-000000000997', 'bad', '2026-11-09T18:00:00Z', '2026-11-09T17:00:00Z', now());
    assert false, 'a workout cannot end before it starts';
  exception when check_violation then null;
  end;
  begin
    update public.profiles set units = 'stone';
    assert false, 'unknown units should be rejected';
  exception when check_violation then null;
  end;
end $$;

-- ── Reporting views ─────────────────────────────────────────────────────────
do $$
declare
  week record;
begin
  -- Two completed bench sets and one pull-up set; the unticked set is excluded.
  assert (select count(*) from public.workout_sets) = 3, 'workout_sets should list completed sets only';
  assert (select sum(weight_kg * reps) from public.workout_sets where exercise_id = 'bench-press') = 800,
    'bench volume should be 2 x 80 x 5';

  select * into week from public.weekly_volume;
  assert week.week_start = date '2026-11-09', 'week should start on Monday 9 November';
  assert week.workouts = 1 and week.sets = 3 and week.volume_kg = 800, 'weekly totals should match';

  -- Tombstoned workouts drop out of reporting.
  update public.workouts set deleted_at = now(), updated_at = '2026-11-09T22:00:00Z'
    where id = 'aaaaaaaa-0000-4000-8000-000000000001';
  assert (select count(*) from public.workout_sets) = 0, 'deleted workouts should not be reported';
end $$;

-- ── Account deletion cascades ───────────────────────────────────────────────
reset role;
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';

do $$
begin
  assert (select count(*) from public.workouts where user_id = '11111111-1111-4111-8111-111111111111') = 0,
    'deleting a user should remove their workouts';
  assert (select count(*) from public.workouts) = 1, 'other users'' data should be untouched';
end $$;

rollback;

\echo 'All database tests passed.'
