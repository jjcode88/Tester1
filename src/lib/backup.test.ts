import { describe, expect, it } from 'vitest';
import { backupDue, backupFileName } from './backup';
import { findExercise } from './exercises';
import { buildSampleData } from './seed';
import { createStore, EPOCH, memoryStorage } from './store';
import { manualClock } from './testing';

function withOneWorkout() {
  const clock = manualClock('2026-11-20T18:00:00.000Z');
  const store = createStore(memoryStorage(), clock);
  const w = store.startWorkout({ kind: 'empty' });
  store.addExercise(w.id, findExercise('squat')!);
  const row = store.getState().workouts[w.id]!.exercises[0]!;
  store.updateSet(w.id, row.id, row.sets[0]!.id, { weightKg: 100, reps: 5, done: true });
  store.finishWorkout(w.id);
  return { store, clock };
}

const at = (iso: string) => new Date(iso);

describe('backup reminder', () => {
  it('stays quiet with nothing to lose', () => {
    const store = createStore(memoryStorage());
    expect(backupDue(store.getState(), at('2026-11-20T00:00:00Z'), false)).toBe(false);
  });

  it('ignores sample data', () => {
    const store = createStore(memoryStorage());
    const sample = buildSampleData(at('2026-11-20T00:00:00Z'));
    store.mergeRecords(sample.workouts, sample.body, true);
    expect(backupDue(store.getState(), at('2026-11-20T00:00:00Z'), false)).toBe(false);
  });

  it('asks once there is a workout and no backup yet', () => {
    const { store } = withOneWorkout();
    expect(backupDue(store.getState(), at('2026-11-20T19:00:00Z'), false)).toBe(true);
  });

  it('never asks people whose data syncs to the cloud', () => {
    const { store } = withOneWorkout();
    expect(backupDue(store.getState(), at('2026-11-20T19:00:00Z'), true)).toBe(false);
  });

  it('waits a week after a backup, and only if something changed', () => {
    const { store, clock } = withOneWorkout();
    store.updateSettings({ lastBackupAt: '2026-11-20T19:00:00.000Z' });
    // Nothing new, even a month later.
    expect(backupDue(store.getState(), at('2026-12-20T00:00:00Z'), false)).toBe(false);

    clock.advance(2 * 86_400_000);
    const w = Object.values(store.getState().workouts)[0]!;
    store.renameWorkout(w.id, 'Leg day');
    expect(backupDue(store.getState(), at('2026-11-25T00:00:00Z'), false)).toBe(false);
    expect(backupDue(store.getState(), at('2026-11-28T00:00:00Z'), false)).toBe(true);
  });

  it('keeps the backup date on this device only', () => {
    const { store } = withOneWorkout();
    store.updateSettings({ lastBackupAt: '2026-11-20T19:00:00.000Z' });
    expect(store.getState().dirty.settings).toBe(false);
    expect(store.getState().settings.updatedAt).toBe(EPOCH);
  });

  it('names files by date', () => {
    expect(backupFileName(new Date(2026, 10, 23, 9))).toBe('cadence-backup-2026-11-23.json');
  });
});
