import { describe, expect, it } from 'vitest';
import { findExercise } from './exercises';
import { seededRandom, seededUuid } from './ids';
import { createStore, memoryStorage } from './store';
import type { Store } from './store';
import { pendingCount, syncOnce } from './sync';
import { FakeRemote, manualClock } from './testing';
import type { BodyEntry, Workout } from './types';

const USER = 'a1b2c3d4-0000-4000-8000-000000000001';
const OTHER_USER = 'a1b2c3d4-0000-4000-8000-000000000002';
const bench = findExercise('bench-press')!;

function device(clock = manualClock()) {
  return { clock, store: createStore(memoryStorage(), clock) };
}

function logWorkout(store: Store, name: string): Workout {
  const w = store.startWorkout({ kind: 'empty', name });
  store.addExercise(w.id, bench);
  const row = store.getState().workouts[w.id]!.exercises[0]!;
  store.updateSet(w.id, row.id, row.sets[0]!.id, { weightKg: 80, reps: 5, done: true });
  return store.finishWorkout(w.id)!;
}

const live = (store: Store) => Object.values(store.getState().workouts).filter((w) => !w.deletedAt);

describe('sync', () => {
  it('uploads local data on first sign-in and clears the pending queue', async () => {
    const remote = new FakeRemote();
    const { store } = device();
    const w = logWorkout(store, 'First');
    store.logBody('2026-11-16', 82);
    expect(pendingCount(store.getState())).toBe(2);

    const result = await syncOnce(store, remote, USER);
    expect(result.pushed).toBe(2);
    expect(remote.tables.workouts.get(w.id)?.record).toMatchObject({ name: 'First' });
    expect(remote.tables.body.size).toBe(1);
    expect(pendingCount(store.getState())).toBe(0);
    expect(store.getState().sync.userId).toBe(USER);
    expect(store.getState().sync.lastSyncedAt).not.toBeNull();
    expect(store.getState().sync.cursors.workouts?.id).toBe(w.id);
  });

  it('brings a second device up to date, then carries edits both ways', async () => {
    const remote = new FakeRemote();
    const a = device();
    const b = device();
    const w = logWorkout(a.store, 'From A');
    await syncOnce(a.store, remote, USER);
    await syncOnce(b.store, remote, USER);
    expect(live(b.store).map((x) => x.name)).toEqual(['From A']);

    b.clock.advance(60_000);
    b.store.renameWorkout(w.id, 'Renamed on B');
    const second = logWorkout(b.store, 'From B');
    await syncOnce(b.store, remote, USER);

    // A now pulls with a saved cursor rather than from the beginning.
    const result = await syncOnce(a.store, remote, USER);
    expect(result.pulled).toBe(2);
    expect(a.store.getState().workouts[w.id]!.name).toBe('Renamed on B');
    expect(a.store.getState().workouts[second.id]!.name).toBe('From B');
    expect(pendingCount(a.store.getState())).toBe(0);
  });

  it('propagates deletions as tombstones and then forgets them locally', async () => {
    const remote = new FakeRemote();
    const a = device();
    const b = device();
    const w = logWorkout(a.store, 'Doomed');
    await syncOnce(a.store, remote, USER);
    await syncOnce(b.store, remote, USER);

    a.clock.advance(1000);
    a.store.deleteWorkout(w.id);
    expect(a.store.getState().workouts[w.id]!.deletedAt).not.toBeNull();
    await syncOnce(a.store, remote, USER);
    expect(a.store.getState().workouts[w.id]).toBeUndefined();
    expect(remote.tables.workouts.get(w.id)!.record.deletedAt).not.toBeNull();

    await syncOnce(b.store, remote, USER);
    expect(b.store.getState().workouts[w.id]).toBeUndefined();
  });

  it('resolves concurrent edits by last write, on both devices', async () => {
    const remote = new FakeRemote();
    const a = device();
    const b = device();
    const w = logWorkout(a.store, 'Original');
    await syncOnce(a.store, remote, USER);
    await syncOnce(b.store, remote, USER);

    a.clock.advance(10_000);
    a.store.renameWorkout(w.id, 'Edited on A (earlier)');
    b.clock.advance(20_000);
    b.store.renameWorkout(w.id, 'Edited on B (later)');

    // B syncs first; A's older edit must not overwrite it.
    await syncOnce(b.store, remote, USER);
    await syncOnce(a.store, remote, USER);
    expect(remote.tables.workouts.get(w.id)!.record).toMatchObject({ name: 'Edited on B (later)' });
    expect(a.store.getState().workouts[w.id]!.name).toBe('Edited on B (later)');
    expect(pendingCount(a.store.getState())).toBe(0);

    await syncOnce(b.store, remote, USER);
    expect(b.store.getState().workouts[w.id]!.name).toBe('Edited on B (later)');
  });

  it('lets a later edit win even when the earlier one reached the server first', async () => {
    const remote = new FakeRemote();
    const a = device();
    const b = device();
    const w = logWorkout(a.store, 'Original');
    await syncOnce(a.store, remote, USER);
    await syncOnce(b.store, remote, USER);

    a.clock.advance(10_000);
    a.store.renameWorkout(w.id, 'A earlier');
    b.clock.advance(20_000);
    b.store.renameWorkout(w.id, 'B later');
    await syncOnce(a.store, remote, USER);
    await syncOnce(b.store, remote, USER);
    await syncOnce(a.store, remote, USER);
    expect(a.store.getState().workouts[w.id]!.name).toBe('B later');
    expect(b.store.getState().workouts[w.id]!.name).toBe('B later');
  });

  it('keeps a record pending when it changes while its upload is in flight', async () => {
    const remote = new FakeRemote();
    const { store } = device();
    const w = logWorkout(store, 'Before');
    remote.beforePush = (table) => {
      remote.beforePush = null;
      if (table === 'workouts') store.renameWorkout(w.id, 'Changed mid-flight');
    };
    await syncOnce(store, remote, USER);
    expect(store.getState().dirty.workouts).toEqual([w.id]);
    expect(remote.tables.workouts.get(w.id)!.record).toMatchObject({ name: 'Before' });

    await syncOnce(store, remote, USER);
    expect(store.getState().dirty.workouts).toEqual([]);
    expect(remote.tables.workouts.get(w.id)!.record).toMatchObject({ name: 'Changed mid-flight' });
  });

  it('pages through large histories, including rows that share a timestamp', async () => {
    const remote = new FakeRemote();
    remote.sameStampPerBatch = true;
    const a = device();
    const random = seededRandom(42);
    const many: BodyEntry[] = Array.from({ length: 1234 }, (_, i) => ({
      id: seededUuid(random),
      date: `20${String(10 + Math.floor(i / 365)).padStart(2, '0')}-01-01`,
      weightKg: 80,
      updatedAt: new Date(Date.parse('2020-01-01T00:00:00Z') + i * 1000).toISOString(),
      deletedAt: null,
    }));
    a.store.mergeRecords([], many);
    await syncOnce(a.store, remote, USER, { batchSize: 400, pageSize: 100 });
    expect(remote.tables.body.size).toBe(1234);
    // 400 rows per batch share one server timestamp, so paging must break ties on id.
    expect(new Set([...remote.tables.body.values()].map((r) => r.at)).size).toBe(4);

    const b = device();
    const result = await syncOnce(b.store, remote, USER, { pageSize: 100 });
    expect(result.pulled).toBe(1234);
    expect(Object.keys(b.store.getState().body)).toHaveLength(1234);
  });

  it('picks up a row that committed just behind the cursor', async () => {
    const remote = new FakeRemote();
    const a = device();
    const b = device();
    logWorkout(a.store, 'Seen');
    await syncOnce(a.store, remote, USER);
    await syncOnce(b.store, remote, USER);

    // A row stamped 5 s before B's cursor becomes visible only now.
    const cursorAt = Date.parse(b.store.getState().sync.cursors.workouts!.at);
    const late: Workout = { ...logWorkout(device().store, 'Late commit'), id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' };
    remote.insertAt('workouts', late, cursorAt - 5000);

    await syncOnce(b.store, remote, USER);
    expect(b.store.getState().workouts[late.id]!.name).toBe('Late commit');
  });

  it('recovers after a failed round trip without losing anything', async () => {
    const remote = new FakeRemote();
    const { store } = device();
    logWorkout(store, 'Offline work');
    store.logBody('2026-11-16', 81);
    remote.failNextPull = new Error('network down');
    await expect(syncOnce(store, remote, USER)).rejects.toThrow('network down');
    // The body entry was never sent, so it is still queued.
    expect(store.getState().dirty.body).toHaveLength(1);

    const result = await syncOnce(store, remote, USER);
    expect(result.pushed).toBe(1);
    expect(pendingCount(store.getState())).toBe(0);
    expect(remote.tables.workouts.size).toBe(1);
    expect(remote.tables.body.size).toBe(1);
  });

  it('never mixes two accounts on one device', async () => {
    const remoteA = new FakeRemote();
    const remoteB = new FakeRemote();
    const { store } = device();
    logWorkout(store, 'Belongs to A');
    await syncOnce(store, remoteA, USER);

    await syncOnce(store, remoteB, OTHER_USER);
    expect(live(store)).toEqual([]);
    expect(remoteB.tables.workouts.size).toBe(0);
    expect(store.getState().sync.userId).toBe(OTHER_USER);

    // Signing back in as the first account restores their data from the server.
    await syncOnce(store, remoteA, USER);
    expect(live(store).map((w) => w.name)).toEqual(['Belongs to A']);
  });

  it('syncs settings with last write wins, and creates the profile on first sync', async () => {
    const remote = new FakeRemote();
    const a = device();
    const b = device();
    await syncOnce(a.store, remote, USER);
    expect(remote.settings).toMatchObject({ units: 'kg', weeklyGoal: 3 });

    a.clock.advance(5000);
    a.store.updateSettings({ units: 'lb', weeklyGoal: 5 });
    await syncOnce(a.store, remote, USER);
    await syncOnce(b.store, remote, USER);
    expect(b.store.getState().settings).toMatchObject({ units: 'lb', weeklyGoal: 5, theme: 'system' });
    expect(b.store.getState().dirty.settings).toBe(false);

    // Untouched defaults on a new device never overwrite saved settings.
    const c = device();
    c.store.updateSettings({ theme: 'dark' });
    await syncOnce(c.store, remote, USER);
    expect(remote.settings).toMatchObject({ units: 'lb', weeklyGoal: 5 });
    expect(c.store.getState().settings).toMatchObject({ units: 'lb', theme: 'dark' });
  });

  it('is a no-op when nothing has changed', async () => {
    const remote = new FakeRemote();
    const { store } = device();
    logWorkout(store, 'Once');
    await syncOnce(store, remote, USER);
    const before = { ...remote.calls };
    const result = await syncOnce(store, remote, USER);
    expect(result).toEqual({ pushed: 0, pulled: 0 });
    expect(remote.calls.push).toBe(before.push);
  });
});
