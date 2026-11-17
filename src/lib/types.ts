export type Units = 'kg' | 'lb';
export type ThemePref = 'system' | 'light' | 'dark';
export type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'core';
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell';

export interface ExerciseDef {
  id: string;
  name: string;
  muscle: MuscleGroup;
  equipment: Equipment;
}

export interface SetEntry {
  id: string;
  /** Always stored in kilograms; converted for display. 0 means bodyweight. */
  weightKg: number;
  reps: number;
  done: boolean;
}

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  /** Snapshot of the name and muscle group so history survives library changes. */
  name: string;
  muscle: MuscleGroup;
  sets: SetEntry[];
}

/** Fields every synced record carries. */
export interface SyncMeta {
  id: string;
  /** ISO timestamp of the last local edit. Last write wins across devices. */
  updatedAt: string;
  /** Tombstone: set instead of removing so deletions reach other devices. */
  deletedAt: string | null;
}

export interface Workout extends SyncMeta {
  name: string;
  startedAt: string;
  /** null while the session is in progress. */
  endedAt: string | null;
  notes: string;
  exercises: WorkoutExercise[];
}

export interface BodyEntry extends SyncMeta {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  weightKg: number;
}

export interface Settings {
  units: Units;
  weeklyGoal: number;
  restSeconds: number;
  /** Device-only preference; never synced. */
  theme: ThemePref;
  updatedAt: string;
}

export type SyncTable = 'workouts' | 'body';

export interface Cursor {
  /** Raw server timestamp, kept as a string to preserve microseconds. */
  at: string;
  id: string;
}

export interface AppState {
  version: 1;
  workouts: Record<string, Workout>;
  body: Record<string, BodyEntry>;
  settings: Settings;
  /** Records changed locally and not yet confirmed by the server. */
  dirty: { workouts: string[]; body: string[]; settings: boolean };
  sync: {
    userId: string | null;
    cursors: Record<SyncTable, Cursor | null>;
    lastSyncedAt: string | null;
  };
  /** Ids created by "Load sample data", so they can be removed again. */
  sampleIds: string[];
}
