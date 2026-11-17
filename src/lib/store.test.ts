import { describe, expect, it } from 'vitest';
import { activeWorkout, completedWorkouts } from './analytics';
import { findExercise } from './exercises';
import { buildSampleData } from './seed';
import { createStore, EPOCH, memoryStorage, parseExport, STORAGE_KEY } from './store';
import { manualClock } from './testing';

const bench = findExercise('bench-press')!;

function setup() {
  const storage = memoryStorage();
  const clock = manualClock();
  return { storage, clock, store: createStore(storage, clock) };
}

describe('logging a workout', () => {
  it('runs a session from start to finish', () => {
    const { store, clock } = setup();
    const w = store.startWorkout({ kind: 'empty', name: 'Test' });
    store.addExercise(w.id, bench);
    const row = store.getState().workouts[w.id]!.exercises[0]!;
    expect(row.sets).toHaveLength(3);

    store.updateSet(w.id, row.id, row.sets[0]!.id, { weightKg: 80, reps: 5, done: true });
    store.updateSet(w.id, row.id, row.sets[1]!.id, { weightKg: 80, reps: 5, done: true });
    store.addSet(w.id, row.id);
    const added = store.getState().workouts[w.id]!.exercises[0]!.sets[3]!;
    expect(added).toMatchObject({ weightKg: 0, reps: 0, done: false });

    clock.advance(45 * 60_000);
    const finished = store.finishWorkout(w.id)!;
    // Unticked sets are dropped on finish.
    expect(finished.exercises[0]!.sets).toHaveLength(2);
    expect(Date.parse(finished.endedAt!) - Date.parse(finished.startedAt)).toBe(45 * 60_000);
    expect(activeWorkout(Object.values(store.getState().workouts))).toBeNull();
    expect(completedWorkouts(Object.values(store.getState().workouts))).toHaveLength(1);
  });

  it('allows only one session at a time', () => {
    const { store } = setup();
    const first = store.startWorkout({ kind: 'empty' });
    const second = store.startWorkout({ kind: 'template', templateId: 'push' });
    expect(second.id).toBe(first.id);
  });

  it('discards a session with nothing completed', () => {
    const { store } = setup();
    const w = store.startWorkout({ kind: 'template', templateId: 'legs' });
    expect(store.finishWorkout(w.id)).toBeNull();
    expect(store.getState().workouts[w.id]).toBeUndefined();
    expect(store.getState().dirty.workouts).toEqual([]);
  });

  it('builds a template session and pre-fills from the last performance', () => {
    const { store, clock } = setup();
    const first = store.startWorkout({ kind: 'template', templateId: 'push' });
    const row = store.getState().workouts[first.id]!.exercises[0]!;
    expect(row.exerciseId).toBe('bench-press');
    expect(row.sets).toHaveLength(4);
    expect(row.sets[0]).toMatchObject({ weightKg: 0, reps: 6, done: false });
    store.updateSet(first.id, row.id, row.sets[0]!.id, { weightKg: 72.5, reps: 6, done: true });
    store.finishWorkout(first.id);

    clock.advance(2 * 86_400_000);
    const second = store.startWorkout({ kind: 'template', templateId: 'push' });
    const again = store.getState().workouts[second.id]!.exercises[0]!;
    expect(again.sets).toHaveLength(1);
    expect(again.sets[0]).toMatchObject({ weightKg: 72.5, reps: 6, done: false });
  });

  it('repeats an earlier workout with fresh, unticked sets', () => {
    const { store, clock } = setup();
    const w = store.startWorkout({ kind: 'empty', name: 'Heavy day' });
    store.addExercise(w.id, bench);
    const row = store.getState().workouts[w.id]!.exercises[0]!;
    store.updateSet(w.id, row.id, row.sets[0]!.id, { weightKg: 90, reps: 3, done: true });
    const finished = store.finishWorkout(w.id)!;
    clock.advance(86_400_000);

    const copy = store.startWorkout({ kind: 'repeat', workout: finished });
    expect(copy.id).not.toBe(finished.id);
    expect(copy.name).toBe('Heavy day');
    expect(copy.exercises[0]!.sets[0]).toMatchObject({ weightKg: 90, reps: 3, done: false });
    expect(copy.exercises[0]!.sets[0]!.id).not.toBe(finished.exercises[0]!.sets[0]!.id);
  });
});

describe('change tracking', () => {
  it('marks edits dirty and always moves updatedAt forward', () => {
    const { store } = setup();
    const w = store.startWorkout({ kind: 'empty' });
    expect(store.getState().dirty.workouts).toEqual([w.id]);
    // The clock has not moved, yet each edit must be newer than the last.
    const a = store.renameWorkout(w.id, 'A')!;
    const b = store.renameWorkout(w.id, 'B')!;
    expect(Date.parse(a.updatedAt)).toBeGreaterThan(Date.parse(w.updatedAt));
    expect(Date.parse(b.updatedAt)).toBeGreaterThan(Date.parse(a.updatedAt));
    expect(store.getState().dirty.workouts).toEqual([w.id]);
  });

  it('removes records outright before any sync, and tombstones them after', () => {
    const { store } = setup();
    const entry = store.logBody('2026-11-16', 82);
    store.deleteBody(entry.id);
    expect(store.getState().body[entry.id]).toBeUndefined();
    expect(store.getState().dirty.body).toEqual([]);

    const synced = store.logBody('2026-11-15', 82.4);
    store.replace({ ...store.getState(), sync: { ...store.getState().sync, userId: 'user-1' }, dirty: { workouts: [], body: [], settings: false } });
    store.deleteBody(synced.id);
    const tombstone = store.getState().body[synced.id]!;
    expect(tombstone.deletedAt).not.toBeNull();
    expect(store.getState().dirty.body).toEqual([synced.id]);
  });

  it('keeps one body weight reading per day', () => {
    const { store } = setup();
    const first = store.logBody('2026-11-16', 82);
    const second = store.logBody('2026-11-16', 81.6);
    expect(second.id).toBe(first.id);
    expect(Object.keys(store.getState().body)).toHaveLength(1);
    expect(store.getState().body[first.id]!.weightKg).toBe(81.6);
  });

  it('syncs units and goals but keeps the theme on the device', () => {
    const { store } = setup();
    store.updateSettings({ theme: 'dark' });
    expect(store.getState().dirty.settings).toBe(false);
    expect(store.getState().settings.updatedAt).toBe(EPOCH);
    store.updateSettings({ units: 'lb' });
    expect(store.getState().dirty.settings).toBe(true);
    expect(store.getState().settings.updatedAt).not.toBe(EPOCH);
  });
});

describe('persistence', () => {
  it('survives a reload', () => {
    const { store, storage, clock } = setup();
    const w = store.startWorkout({ kind: 'empty', name: 'Persisted' });
    store.updateSettings({ weeklyGoal: 5 });
    store.flush();

    const reloaded = createStore(storage, clock);
    expect(reloaded.getState().workouts[w.id]!.name).toBe('Persisted');
    expect(reloaded.getState().settings.weeklyGoal).toBe(5);
    expect(reloaded.getState().dirty.workouts).toEqual([w.id]);
  });

  it('starts clean when stored data is corrupt or from another version', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, '{not json');
    expect(createStore(storage).getState().workouts).toEqual({});
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, workouts: { x: {} } }));
    expect(createStore(storage).getState().workouts).toEqual({});
  });

  it('works without any storage at all', () => {
    const store = createStore(null);
    store.logBody('2026-11-16', 80);
    store.flush();
    expect(Object.keys(store.getState().body)).toHaveLength(1);
  });

  it('fills in fields added after the data was saved', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, workouts: {}, settings: { units: 'lb' } }));
    const state = createStore(storage).getState();
    expect(state.settings).toMatchObject({ units: 'lb', weeklyGoal: 3, restSeconds: 120 });
    expect(state.sync.cursors).toEqual({ workouts: null, body: null });
    expect(state.sampleIds).toEqual([]);
  });
});

describe('sample data, export and import', () => {
  const sample = buildSampleData(new Date('2026-11-16T20:30:00'));

  it('loads sample data and removes exactly that data again', () => {
    const { store } = setup();
    const own = store.logBody('2026-11-17', 80);
    store.mergeRecords(sample.workouts, sample.body, true);
    expect(Object.keys(store.getState().workouts)).toHaveLength(sample.workouts.length);
    store.clearSample();
    expect(store.getState().workouts).toEqual({});
    expect(Object.keys(store.getState().body)).toEqual([own.id]);
    expect(store.getState().sampleIds).toEqual([]);
  });

  it('round-trips through an export file', () => {
    const { store } = setup();
    store.mergeRecords(sample.workouts, sample.body);
    const file = JSON.stringify(store.exportData());

    const other = createStore(memoryStorage());
    const counts = other.importData(file);
    expect(counts).toEqual({ workouts: sample.workouts.length, body: sample.body.length });
    expect(other.exportData().workouts).toEqual(store.exportData().workouts);
    // Importing the same file again changes nothing.
    expect(other.importData(file)).toEqual({ workouts: 0, body: 0 });
  });

  it('rejects files that are not exports, with a readable reason', () => {
    expect(() => parseExport('nope')).toThrow('not valid JSON');
    expect(() => parseExport('{"app":"other"}')).toThrow('not a Cadence export');
    const bad = JSON.stringify({ app: 'cadence', version: 1, workouts: [{ id: 'x' }] });
    expect(() => parseExport(bad)).toThrow('Workout 1 has no valid id');
    const badSet = JSON.stringify({
      app: 'cadence',
      version: 1,
      workouts: [
        {
          id: '0b7e0e52-6a3f-4c58-9d0c-6d6f0a5e7a11',
          startedAt: '2026-11-01T10:00:00Z',
          exercises: [{ name: 'Bench', sets: [{ weightKg: -5, reps: 5 }] }],
        },
      ],
    });
    expect(() => parseExport(badSet)).toThrow('malformed set');
  });

  it('erases everything on reset', () => {
    const { store, storage } = setup();
    store.mergeRecords(sample.workouts, sample.body, true);
    store.resetAll();
    expect(store.getState().workouts).toEqual({});
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).workouts).toEqual({});
  });
});
