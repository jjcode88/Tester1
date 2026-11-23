import { useMemo, useSyncExternalStore } from 'react';
import { activeWorkout, completedWorkouts } from './lib/analytics';
import { createCloud } from './lib/cloud';
import { browserStorage, createStore } from './lib/store';
import { formatWeight } from './lib/units';
import { saveBackup } from './lib/backup';
import { captureError } from './lib/monitoring';
import { toast } from './lib/ui';
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

/** Saves a backup file and remembers when, so the reminder can stand down. */
export async function backUpNow(): Promise<void> {
  const now = new Date();
  try {
    const outcome = await saveBackup(JSON.stringify(store.exportData(), null, 2), now);
    if (outcome === 'cancelled') return;
    store.updateSettings({ lastBackupAt: now.toISOString() });
    toast(outcome === 'shared' ? 'Backup ready. Keep it somewhere safe, like iCloud Drive.' : 'Backup downloaded.');
  } catch (error) {
    captureError(error, { area: 'backup' });
    toast('The backup could not be saved. Try again, or use a different browser.', 'bad');
  }
}
