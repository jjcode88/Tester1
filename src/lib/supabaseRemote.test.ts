import { describe, expect, it } from 'vitest';
import { afterCursorFilter, bodyToRow, rowToBody, rowToWorkout, workoutToRow } from './supabaseRemote';
import type { Workout } from './types';

const workout: Workout = {
  id: '0b7e0e52-6a3f-4c58-9d0c-6d6f0a5e7a11',
  name: '  Push  ',
  startedAt: '2026-11-16T18:00:00.000Z',
  endedAt: '2026-11-16T19:02:00.000Z',
  notes: 'Felt strong',
  exercises: [
    {
      id: 'e1',
      exerciseId: 'bench-press',
      name: 'Bench press',
      muscle: 'chest',
      sets: [{ id: 's1', weightKg: 82.5, reps: 5, done: true }],
    },
  ],
  updatedAt: '2026-11-16T19:02:00.000Z',
  deletedAt: null,
};

describe('Supabase row mapping', () => {
  it('round-trips a workout, normalising Postgres timestamps', () => {
    const row = workoutToRow(workout);
    expect(row).toMatchObject({ name: 'Push', started_at: workout.startedAt, deleted_at: null });
    // Postgres answers with "+00:00" offsets; the app compares "…Z" strings.
    const back = rowToWorkout({
      ...row,
      started_at: '2026-11-16T18:00:00+00:00',
      ended_at: '2026-11-16T19:02:00+00:00',
      updated_at: '2026-11-16T19:02:00+00:00',
    });
    expect(back).toEqual({ ...workout, name: 'Push' });
  });

  it('never sends an empty name the database would reject', () => {
    expect(workoutToRow({ ...workout, name: '   ' }).name).toBe('Workout');
    expect(workoutToRow({ ...workout, name: 'x'.repeat(200) }).name).toHaveLength(120);
  });

  it('reads numeric columns that arrive as strings', () => {
    const body = { id: 'b1', date: '2026-11-16', weightKg: 81.4, updatedAt: '2026-11-16T07:30:00.000Z', deletedAt: null };
    const row = bodyToRow(body);
    expect(row).toMatchObject({ measured_on: '2026-11-16', weight_kg: 81.4 });
    expect(rowToBody({ ...row, weight_kg: '81.40' as unknown as number, updated_at: '2026-11-16T07:30:00+00:00' })).toEqual(body);
  });

  it('builds a keyset filter that quotes timestamps', () => {
    expect(afterCursorFilter({ at: '2026-11-16T19:02:00.123456+00:00', id: 'abc' })).toBe(
      'server_updated_at.gt."2026-11-16T19:02:00.123456+00:00",and(server_updated_at.eq."2026-11-16T19:02:00.123456+00:00",id.gt."abc")',
    );
  });
});
