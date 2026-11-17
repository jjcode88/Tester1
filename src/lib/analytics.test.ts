import { describe, expect, it } from 'vitest';
import {
  activeWorkout,
  bestSet,
  bodySeries,
  brzycki,
  completedWorkouts,
  estimateOneRepMax,
  exerciseHistory,
  lastPerformance,
  muscleSetCounts,
  niceTicks,
  personalRecords,
  recordsSetIn,
  weeklySeries,
  weekStreak,
  workoutSetCount,
  workoutVolume,
} from './analytics';
import type { BodyEntry, MuscleGroup, Workout } from './types';

let counter = 0;
const nextId = () => `id-${++counter}`;

function workout(
  day: string,
  lifts: Array<[exerciseId: string, sets: Array<[kg: number, reps: number, done?: boolean]>, muscle?: MuscleGroup]>,
  extra: Partial<Workout> = {},
): Workout {
  const startedAt = new Date(`${day}T18:00:00`).toISOString();
  return {
    id: nextId(),
    name: 'Session',
    startedAt,
    endedAt: new Date(`${day}T19:00:00`).toISOString(),
    notes: '',
    exercises: lifts.map(([exerciseId, sets, muscle]) => ({
      id: nextId(),
      exerciseId,
      name: exerciseId,
      muscle: muscle ?? 'chest',
      sets: sets.map(([weightKg, reps, done]) => ({ id: nextId(), weightKg, reps, done: done ?? true })),
    })),
    updatedAt: startedAt,
    deletedAt: null,
    ...extra,
  };
}

describe('one-rep max estimates', () => {
  it('treats a single as its own max', () => {
    expect(estimateOneRepMax(140, 1)).toBe(140);
    expect(brzycki(140, 1)).toBe(140);
  });

  it('applies the Epley and Brzycki formulas', () => {
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(116.67, 2);
    expect(estimateOneRepMax(60, 30)).toBe(120);
    expect(brzycki(100, 5)).toBeCloseTo(112.5, 2);
  });

  it('returns 0 when there is nothing to estimate', () => {
    expect(estimateOneRepMax(0, 10)).toBe(0);
    expect(estimateOneRepMax(100, 0)).toBe(0);
    expect(brzycki(100, 200)).toBe(3600);
  });
});

describe('volume and set counts', () => {
  const w = workout('2026-11-02', [
    ['bench', [[80, 5], [80, 5], [80, 4, false]]],
    ['pull-up', [[0, 10]]],
    ['curl', [[20, 0]]],
  ]);

  it('counts only completed sets with reps', () => {
    expect(workoutVolume(w)).toBe(800);
    expect(workoutSetCount(w)).toBe(3);
  });
});

describe('completed and active workouts', () => {
  const done = workout('2026-11-02', [['bench', [[80, 5]]]]);
  const earlier = workout('2026-10-28', [['bench', [[80, 5]]]]);
  const deleted = workout('2026-11-03', [['bench', [[80, 5]]]], { deletedAt: '2026-11-04T00:00:00.000Z' });
  const running = workout('2026-11-05', [['bench', [[80, 5]]]], { endedAt: null });

  it('keeps finished, non-deleted workouts in date order', () => {
    expect(completedWorkouts([done, earlier, deleted, running]).map((w) => w.id)).toEqual([earlier.id, done.id]);
  });

  it('finds the session in progress', () => {
    expect(activeWorkout([done, deleted, running])?.id).toBe(running.id);
    expect(activeWorkout([done, deleted])).toBeNull();
  });
});

describe('weekly series', () => {
  // Monday 16 November 2026.
  const now = new Date('2026-11-16T12:00:00');
  const completed = completedWorkouts([
    workout('2026-11-16', [['bench', [[100, 5]]]]),
    workout('2026-11-09', [['bench', [[100, 5]]]]),
    workout('2026-11-15', [['squat', [[100, 10]]]]), // Sunday belongs to the week of the 9th
    workout('2026-09-01', [['bench', [[100, 5]]]]), // outside the window
  ]);

  it('buckets by Monday-start week and includes empty weeks', () => {
    const series = weeklySeries(completed, 4, now);
    expect(series).toHaveLength(4);
    expect(series.map((b) => b.workouts)).toEqual([0, 0, 2, 1]);
    expect(series[2]!.volumeKg).toBe(1500);
    expect(series[3]!.weekStart.getDate()).toBe(16);
  });
});

describe('week streak', () => {
  const now = new Date('2026-11-18T12:00:00'); // Wednesday
  const week = (monday: string, count: number) =>
    Array.from({ length: count }, (_, i) => {
      const d = new Date(`${monday}T12:00:00`);
      d.setDate(d.getDate() + i);
      return workout(d.toISOString().slice(0, 10), [['bench', [[100, 5]]]]);
    });

  it('counts consecutive weeks at or above the goal', () => {
    const completed = completedWorkouts([...week('2026-11-09', 3), ...week('2026-11-02', 3), ...week('2026-10-19', 3)]);
    expect(weekStreak(completed, 3, now)).toBe(2);
  });

  it('does not break while the current week is still in progress', () => {
    const completed = completedWorkouts([...week('2026-11-16', 1), ...week('2026-11-09', 3)]);
    expect(weekStreak(completed, 3, now)).toBe(1);
  });

  it('includes the current week once it reaches the goal', () => {
    const completed = completedWorkouts([...week('2026-11-16', 2), ...week('2026-11-09', 2)]);
    expect(weekStreak(completed, 2, now)).toBe(2);
  });

  it('is zero with no qualifying weeks', () => {
    expect(weekStreak([], 3, now)).toBe(0);
    expect(weekStreak(completedWorkouts(week('2026-11-09', 2)), 3, now)).toBe(0);
  });
});

describe('records', () => {
  const first = workout('2026-10-01', [['bench', [[80, 5], [80, 5]]], ['pull-up', [[0, 8]], 'back']]);
  const second = workout('2026-10-08', [['bench', [[82.5, 5], [80, 6]]], ['pull-up', [[0, 10]], 'back']]);
  const third = workout('2026-10-15', [['bench', [[80, 5]]], ['squat', [[100, 5]], 'legs']]);
  const completed = completedWorkouts([third, first, second]);

  it('picks the set with the highest estimate, breaking ties on reps', () => {
    expect(bestSet(first.exercises[0]!.sets)).toMatchObject({ weightKg: 80, reps: 5 });
    expect(bestSet(second.exercises[0]!.sets)).toMatchObject({ weightKg: 82.5, reps: 5 });
    expect(bestSet(second.exercises[1]!.sets)).toMatchObject({ weightKg: 0, reps: 10, e1rmKg: 0 });
    expect(bestSet([])).toBeNull();
  });

  it('tracks the current best per exercise', () => {
    const records = personalRecords(completed);
    const bench = records.find((r) => r.exerciseId === 'bench')!;
    expect(bench.best.weightKg).toBe(82.5);
    expect(bench.sessions).toBe(3);
    expect(bench.improved).toBe(true);
    const squat = records.find((r) => r.exerciseId === 'squat')!;
    expect(squat.improved).toBe(false);
    // Most recently set first.
    expect(records[0]!.exerciseId).toBe('squat');
  });

  it('counts more reps at bodyweight as a record', () => {
    const pullUp = personalRecords(completed).find((r) => r.exerciseId === 'pull-up')!;
    expect(pullUp.best.reps).toBe(10);
    expect(pullUp.muscle).toBe('back');
  });

  it('lists which exercises a session improved, ignoring first attempts', () => {
    expect(recordsSetIn(completed, second).sort()).toEqual(['bench', 'pull-up']);
    expect(recordsSetIn(completed, third)).toEqual([]);
    expect(recordsSetIn(completed, first)).toEqual([]);
  });

  it('builds per-session history for charting', () => {
    const history = exerciseHistory(completed, 'bench');
    expect(history.map((h) => h.best.weightKg)).toEqual([80, 82.5, 80]);
    expect(history[0]!.volumeKg).toBe(800);
  });

  it('returns the last performance, optionally skipping a workout', () => {
    expect(lastPerformance(completed, 'bench').map((s) => s.weightKg)).toEqual([80]);
    expect(lastPerformance(completed, 'bench', third.id).map((s) => s.weightKg)).toEqual([82.5, 80]);
    expect(lastPerformance(completed, 'deadlift')).toEqual([]);
  });

  it('counts sets per muscle group inside the window', () => {
    const counts = muscleSetCounts(completed, new Date('2026-10-05T00:00:00'));
    expect(counts).toMatchObject({ chest: 3, back: 1, legs: 1, arms: 0 });
  });
});

describe('body weight series', () => {
  const entry = (date: string, weightKg: number, extra: Partial<BodyEntry> = {}): BodyEntry => ({
    id: nextId(),
    date,
    weightKg,
    updatedAt: `${date}T07:00:00.000Z`,
    deletedAt: null,
    ...extra,
  });

  it('sorts, drops deletions and keeps the latest reading per day', () => {
    const series = bodySeries([
      entry('2026-11-03', 82),
      entry('2026-11-01', 84),
      entry('2026-11-02', 99, { deletedAt: '2026-11-02T08:00:00.000Z' }),
      entry('2026-11-03', 83, { updatedAt: '2026-11-03T09:00:00.000Z' }),
    ]);
    expect(series.map((p) => p.weightKg)).toEqual([84, 83]);
    expect(series[1]!.averageKg).toBe(83.5);
    expect(series[0]!.date.getDate()).toBe(1);
  });

  it('averages over at most seven readings', () => {
    const series = bodySeries(Array.from({ length: 9 }, (_, i) => entry(`2026-11-0${i + 1}`, 80 + i)));
    expect(series[8]!.averageKg).toBe(85); // mean of 82..88
  });
});

describe('axis ticks', () => {
  it('produces round steps that cover the range', () => {
    expect(niceTicks(0, 9400)).toEqual([0, 2500, 5000, 7500, 10000]);
    expect(niceTicks(79.2, 83.9)).toEqual([78, 80, 82, 84]);
  });

  it('handles a flat series', () => {
    const ticks = niceTicks(50, 50);
    expect(ticks[0]).toBeLessThan(50);
    expect(ticks[ticks.length - 1]).toBeGreaterThan(50);
  });
});
