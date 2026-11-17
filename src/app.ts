import { useMemo, useSyncExternalStore } from 'react';
import { activeWorkout, completedWorkouts } from './lib/analytics';
import { createCloud } from './lib/cloud';
import { browserStorage, createStore } from './lib/store';
import { formatWeight } from './lib/units';
import type { SetEntry, Units } from './lib/types';

export const store = createStore(browserStorage());
export const cloud = createCloud(store);

export function useAppState() {
  return useSyncExternalStore(store.subscribe, store.getState);
}

export function useCloud() {
  return useSyncExternalStore(cloud.subscribe, cloud.getStatus);
}

/** The lists most screens need, recomputed only when workouts change. */
export function useWorkouts() {
  const { workouts } = useAppState();
  return useMemo(() => {
    const all = Object.values(workouts);
    return { completed: completedWorkouts(all), active: activeWorkout(all) };
  }, [workouts]);
}

/** "80 × 5", or "10 reps" for bodyweight work. */
export function formatSet(set: Pick<SetEntry, 'weightKg' | 'reps'>, units: Units): string {
  return set.weightKg > 0 ? `${formatWeight(set.weightKg, units)} × ${set.reps}` : `${set.reps} reps`;
}
