import { addDays, dayKey, parseDayKey, startOfWeek, weekKey } from './dates';
import type { BodyEntry, MuscleGroup, SetEntry, Workout } from './types';

/** Epley estimate of a one-rep max. A single is its own max. */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/** Brzycki estimate; undefined past 36 reps, so it is capped. */
export function brzycki(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return (weightKg * 36) / (37 - Math.min(reps, 36));
}

const doneSets = (sets: SetEntry[]) => sets.filter((s) => s.done && s.reps > 0);

export function workoutVolume(w: Workout): number {
  let total = 0;
  for (const ex of w.exercises) for (const s of doneSets(ex.sets)) total += s.weightKg * s.reps;
  return total;
}

export function workoutSetCount(w: Workout): number {
  return w.exercises.reduce((n, ex) => n + doneSets(ex.sets).length, 0);
}

/** Finished, non-deleted workouts, oldest first. */
export function completedWorkouts(workouts: Iterable<Workout>): Workout[] {
  return [...workouts]
    .filter((w) => !w.deletedAt && w.endedAt)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function activeWorkout(workouts: Iterable<Workout>): Workout | null {
  let latest: Workout | null = null;
  for (const w of workouts) {
    if (w.deletedAt || w.endedAt) continue;
    if (!latest || w.startedAt > latest.startedAt) latest = w;
  }
  return latest;
}

export interface WeekBucket {
  weekStart: Date;
  workouts: number;
  sets: number;
  volumeKg: number;
}

/** One bucket per week for the last `weeks` weeks, oldest first, gaps included. */
export function weeklySeries(completed: Workout[], weeks: number, now: Date): WeekBucket[] {
  const thisWeek = startOfWeek(now);
  const buckets = new Map<string, WeekBucket>();
  const out: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = addDays(thisWeek, -7 * i);
    const bucket = { weekStart, workouts: 0, sets: 0, volumeKg: 0 };
    buckets.set(dayKey(weekStart), bucket);
    out.push(bucket);
  }
  for (const w of completed) {
    const bucket = buckets.get(weekKey(new Date(w.startedAt)));
    if (!bucket) continue;
    bucket.workouts += 1;
    bucket.sets += workoutSetCount(w);
    bucket.volumeKg += workoutVolume(w);
  }
  return out;
}

/**
 * Consecutive weeks that reached the weekly goal. The current week counts once
 * it reaches the goal, and never breaks the streak while still in progress.
 */
export function weekStreak(completed: Workout[], goal: number, now: Date): number {
  const perWeek = new Map<string, number>();
  for (const w of completed) {
    const key = weekKey(new Date(w.startedAt));
    perWeek.set(key, (perWeek.get(key) ?? 0) + 1);
  }
  const target = Math.max(1, goal);
  let cursor = startOfWeek(now);
  let streak = 0;
  if ((perWeek.get(dayKey(cursor)) ?? 0) >= target) streak += 1;
  cursor = addDays(cursor, -7);
  while ((perWeek.get(dayKey(cursor)) ?? 0) >= target) {
    streak += 1;
    cursor = addDays(cursor, -7);
  }
  return streak;
}

/** Day keys (YYYY-MM-DD) with at least one finished workout. */
export function trainedDays(completed: Workout[]): Set<string> {
  return new Set(completed.map((w) => dayKey(new Date(w.startedAt))));
}

export interface BestSet {
  weightKg: number;
  reps: number;
  e1rmKg: number;
}

/** The set with the highest estimated 1RM; for bodyweight work, the most reps. */
export function bestSet(sets: SetEntry[]): BestSet | null {
  let best: BestSet | null = null;
  for (const s of doneSets(sets)) {
    const candidate = { weightKg: s.weightKg, reps: s.reps, e1rmKg: estimateOneRepMax(s.weightKg, s.reps) };
    if (
      !best ||
      candidate.e1rmKg > best.e1rmKg ||
      (candidate.e1rmKg === best.e1rmKg && candidate.reps > best.reps)
    ) {
      best = candidate;
    }
  }
  return best;
}

export interface ExerciseSession {
  workoutId: string;
  date: Date;
  best: BestSet;
  volumeKg: number;
}

/** Per-session bests for one exercise, oldest first. */
export function exerciseHistory(completed: Workout[], exerciseId: string): ExerciseSession[] {
  const out: ExerciseSession[] = [];
  for (const w of completed) {
    const sets = w.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets);
    const best = bestSet(sets);
    if (!best) continue;
    out.push({
      workoutId: w.id,
      date: new Date(w.startedAt),
      best,
      volumeKg: doneSets(sets).reduce((sum, s) => sum + s.weightKg * s.reps, 0),
    });
  }
  return out;
}

export interface PersonalRecord {
  exerciseId: string;
  name: string;
  muscle: MuscleGroup;
  best: BestSet;
  date: Date;
  sessions: number;
  /** True when the record beat an earlier session rather than being a first attempt. */
  improved: boolean;
}

const beats = (a: BestSet, b: BestSet) => a.e1rmKg > b.e1rmKg || (a.e1rmKg === b.e1rmKg && a.reps > b.reps);

/** Current best per exercise, most recently set first. */
export function personalRecords(completed: Workout[]): PersonalRecord[] {
  const records = new Map<string, PersonalRecord>();
  for (const w of completed) {
    const perExercise = new Map<string, { name: string; muscle: MuscleGroup; sets: SetEntry[] }>();
    for (const ex of w.exercises) {
      const entry = perExercise.get(ex.exerciseId) ?? { name: ex.name, muscle: ex.muscle, sets: [] };
      entry.sets.push(...ex.sets);
      perExercise.set(ex.exerciseId, entry);
    }
    for (const [exerciseId, entry] of perExercise) {
      const best = bestSet(entry.sets);
      if (!best) continue;
      const current = records.get(exerciseId);
      if (!current) {
        records.set(exerciseId, {
          exerciseId,
          name: entry.name,
          muscle: entry.muscle,
          best,
          date: new Date(w.startedAt),
          sessions: 1,
          improved: false,
        });
      } else {
        current.sessions += 1;
        current.name = entry.name;
        if (beats(best, current.best)) {
          current.best = best;
          current.date = new Date(w.startedAt);
          current.improved = true;
        }
      }
    }
  }
  return [...records.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** Exercise ids whose best in `workout` beat every earlier session. */
export function recordsSetIn(completed: Workout[], workout: Workout): string[] {
  const earlier = personalRecords(completed.filter((w) => w.id !== workout.id && w.startedAt < workout.startedAt));
  const previous = new Map(earlier.map((r) => [r.exerciseId, r.best]));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const ex of workout.exercises) {
    if (seen.has(ex.exerciseId)) continue;
    seen.add(ex.exerciseId);
    const sets = workout.exercises.filter((e) => e.exerciseId === ex.exerciseId).flatMap((e) => e.sets);
    const best = bestSet(sets);
    const prev = previous.get(ex.exerciseId);
    if (best && prev && beats(best, prev)) out.push(ex.exerciseId);
  }
  return out;
}

/** Sets from the most recent finished session that included the exercise. */
export function lastPerformance(completed: Workout[], exerciseId: string, excludeWorkoutId?: string): SetEntry[] {
  for (let i = completed.length - 1; i >= 0; i--) {
    const w = completed[i]!;
    if (w.id === excludeWorkoutId) continue;
    const sets = doneSets(w.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets));
    if (sets.length > 0) return sets;
  }
  return [];
}

/** Completed sets per muscle group since `since`. */
export function muscleSetCounts(completed: Workout[], since: Date): Record<MuscleGroup, number> {
  const counts: Record<MuscleGroup, number> = { chest: 0, back: 0, shoulders: 0, arms: 0, legs: 0, core: 0 };
  for (const w of completed) {
    if (new Date(w.startedAt) < since) continue;
    for (const ex of w.exercises) counts[ex.muscle] += doneSets(ex.sets).length;
  }
  return counts;
}

export interface BodyPoint {
  date: Date;
  weightKg: number;
  /** Mean of this and up to six earlier readings. */
  averageKg: number;
}

/** One reading per day (latest edit wins), oldest first, with a 7-reading average. */
export function bodySeries(entries: Iterable<BodyEntry>): BodyPoint[] {
  const perDay = new Map<string, BodyEntry>();
  for (const e of entries) {
    if (e.deletedAt) continue;
    const existing = perDay.get(e.date);
    if (!existing || e.updatedAt > existing.updatedAt) perDay.set(e.date, e);
  }
  const sorted = [...perDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((e, i) => {
    const window = sorted.slice(Math.max(0, i - 6), i + 1);
    return {
      date: parseDayKey(e.date),
      weightKg: e.weightKg,
      averageKg: window.reduce((sum, x) => sum + x.weightKg, 0) / window.length,
    };
  });
}

/** Exercises that appear in history, most frequently trained first. */
export function trainedExercises(completed: Workout[]): Array<{ exerciseId: string; name: string; sessions: number }> {
  const map = new Map<string, { exerciseId: string; name: string; sessions: number }>();
  for (const w of completed) {
    const seen = new Set<string>();
    for (const ex of w.exercises) {
      if (seen.has(ex.exerciseId) || doneSets(ex.sets).length === 0) continue;
      seen.add(ex.exerciseId);
      const entry = map.get(ex.exerciseId) ?? { exerciseId: ex.exerciseId, name: ex.name, sessions: 0 };
      entry.sessions += 1;
      entry.name = ex.name;
      map.set(ex.exerciseId, entry);
    }
  }
  return [...map.values()].sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
}

/** "Nice" axis ticks covering [min, max] with roughly `count` steps. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
    min -= pad;
    max += pad;
  }
  const rawStep = (max - min) / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  // The smallest round step that keeps the tick count at or under `count`.
  const step = (residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10) * magnitude;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}
