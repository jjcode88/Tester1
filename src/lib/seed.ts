import { addDays, dayKey, startOfWeek } from './dates';
import { findExercise } from './exercises';
import { seededRandom, seededUuid } from './ids';
import type { BodyEntry, SetEntry, Workout, WorkoutExercise } from './types';

interface Plan {
  name: string;
  /** exercise id, starting weight (kg), weekly increase (kg), sets, reps */
  lifts: Array<[string, number, number, number, number]>;
}

const PLANS: Plan[] = [
  {
    name: 'Push',
    lifts: [
      ['bench-press', 70, 1.25, 4, 6],
      ['overhead-press', 42.5, 0.5, 3, 8],
      ['incline-db-press', 24, 0.5, 3, 10],
      ['lateral-raise', 9, 0.25, 3, 15],
      ['triceps-pushdown', 27.5, 0.75, 3, 12],
    ],
  },
  {
    name: 'Pull',
    lifts: [
      ['deadlift', 120, 2.5, 3, 5],
      ['pull-up', 0, 0, 3, 8],
      ['barbell-row', 65, 1.25, 3, 8],
      ['face-pull', 22.5, 0.5, 3, 15],
      ['barbell-curl', 30, 0.5, 3, 10],
    ],
  },
  {
    name: 'Legs',
    lifts: [
      ['squat', 95, 2.5, 4, 6],
      ['romanian-deadlift', 80, 1.25, 3, 8],
      ['leg-press', 160, 5, 3, 12],
      ['leg-curl', 40, 1, 3, 12],
      ['calf-raise', 60, 1.25, 4, 12],
    ],
  },
];

/** Monday, Wednesday, Friday; some weeks add a Saturday session. */
const WEEKDAY_OFFSETS = [0, 2, 4];
const roundTo = (value: number, step: number) => Math.round(value / step) * step;

/**
 * Ten weeks of plausible training: a push/pull/legs rotation with steady
 * progression, the occasional missed rep, one deload week and a slow cut in
 * body weight. Deterministic for a given `now`, so screenshots and tests agree.
 */
export function buildSampleData(now: Date, weeks = 10): { workouts: Workout[]; body: BodyEntry[] } {
  const random = seededRandom(20261116);
  const id = () => seededUuid(random);
  const workouts: Workout[] = [];
  const firstWeek = addDays(startOfWeek(now), -7 * (weeks - 1));
  let rotation = 0;

  for (let week = 0; week < weeks; week++) {
    const weekStart = addDays(firstWeek, week * 7);
    const deload = week === 6;
    const offsets = week % 3 === 1 ? [...WEEKDAY_OFFSETS, 5] : WEEKDAY_OFFSETS;
    for (const offset of offsets) {
      const start = addDays(weekStart, offset);
      start.setHours(offset === 5 ? 10 : 18, Math.floor(random() * 40), 0, 0);
      if (start > now) continue;
      const plan = PLANS[rotation % PLANS.length]!;
      rotation += 1;

      const exercises: WorkoutExercise[] = plan.lifts.map(([exerciseId, base, step, setCount, reps]) => {
        const def = findExercise(exerciseId)!;
        const increment = def.equipment === 'dumbbell' ? 1 : 2.5;
        const target = base === 0 ? 0 : roundTo((base + step * week) * (deload ? 0.85 : 1), increment);
        const sets: SetEntry[] = Array.from({ length: setCount }, (_, i) => {
          // Later sets sometimes fall a rep or two short; bodyweight work creeps up over time.
          const fatigue = i >= setCount - 1 && random() < 0.45 ? 1 + Math.floor(random() * 2) : 0;
          const progress = base === 0 ? Math.floor(week / 3) : 0;
          return { id: id(), weightKg: target, reps: Math.max(1, reps + progress - fatigue), done: true };
        });
        return { id: id(), exerciseId, name: def.name, muscle: def.muscle, sets };
      });

      const minutes = 52 + Math.floor(random() * 24);
      const ended = new Date(start.getTime() + minutes * 60_000);
      workouts.push({
        id: id(),
        name: plan.name,
        startedAt: start.toISOString(),
        endedAt: ended.toISOString(),
        notes: deload ? 'Deload week: lighter loads, same movements.' : '',
        exercises,
        updatedAt: ended.toISOString(),
        deletedAt: null,
      });
    }
  }

  const body: BodyEntry[] = [];
  const days = weeks * 7;
  for (let i = days - 1; i >= 0; i--) {
    // Roughly four weigh-ins a week.
    if (random() < 0.42 && i !== 0) continue;
    const date = addDays(now, -i);
    const trend = 83.6 - ((days - 1 - i) / days) * 2.9;
    const noise = (random() - 0.5) * 0.9;
    const stamp = new Date(date);
    stamp.setHours(7, 30, 0, 0);
    body.push({
      id: id(),
      date: dayKey(date),
      weightKg: Math.round((trend + noise) * 10) / 10,
      updatedAt: stamp.toISOString(),
      deletedAt: null,
    });
  }

  return { workouts, body };
}
