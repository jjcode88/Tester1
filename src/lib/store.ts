import { activeWorkout, completedWorkouts, lastPerformance } from './analytics';
import { findExercise } from './exercises';
import { uuid } from './ids';
import { findTemplate } from './templates';
import type {
  AppState,
  BodyEntry,
  ExerciseDef,
  SetEntry,
  Settings,
  SyncMeta,
  SyncTable,
  Workout,
  WorkoutExercise,
} from './types';

export const STORAGE_KEY = 'cadence.v1';
export const EPOCH = '1970-01-01T00:00:00.000Z';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const DEFAULT_SETTINGS: Settings = {
  units: 'kg',
  weeklyGoal: 3,
  restSeconds: 120,
  theme: 'system',
  // Defaults carry the epoch so settings saved on another device always win.
  updatedAt: EPOCH,
};

export function initialState(): AppState {
  return {
    version: 1,
    workouts: {},
    body: {},
    settings: { ...DEFAULT_SETTINGS },
    dirty: { workouts: [], body: [], settings: false },
    sync: { userId: null, cursors: { workouts: null, body: null }, lastSyncedAt: null },
    sampleIds: [],
  };
}

export interface ExportFile {
  app: 'cadence';
  version: 1;
  exportedAt: string;
  settings: Pick<Settings, 'units' | 'weeklyGoal' | 'restSeconds'>;
  workouts: Workout[];
  body: BodyEntry[];
}

const without = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : list);
const withId = (list: string[], id: string) => (list.includes(id) ? list : [...list, id]);

function omit<T>(record: Record<string, T>, id: string): Record<string, T> {
  if (!(id in record)) return record;
  const next = { ...record };
  delete next[id];
  return next;
}

export type StartOptions =
  | { kind: 'empty'; name?: string }
  | { kind: 'template'; templateId: string }
  | { kind: 'repeat'; workout: Workout };

export function createStore(storage: StorageLike | null, clock: () => Date = () => new Date()) {
  let state = load(storage);
  const listeners = new Set<() => void>();
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  function persistNow() {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: the session keeps working from memory.
    }
  }

  function set(next: AppState) {
    if (next === state) return;
    state = next;
    if (!persistTimer) persistTimer = setTimeout(persistNow, 120);
    for (const listener of listeners) listener();
  }

  /** A timestamp for a local edit that is always later than the version it replaces. */
  function stamp(previous?: string): string {
    const now = clock().getTime();
    const floor = previous ? Date.parse(previous) + 1 : 0;
    return new Date(Math.max(now, floor)).toISOString();
  }

  function putRecord<T extends SyncMeta>(table: SyncTable, record: T) {
    set({
      ...state,
      [table]: { ...state[table], [record.id]: record },
      dirty: { ...state.dirty, [table]: withId(state.dirty[table], record.id) },
    });
  }

  /** Tombstones a record, or simply drops it when no server has ever seen it. */
  function removeRecord(table: SyncTable, id: string) {
    const existing = state[table][id];
    if (!existing) return;
    if (state.sync.userId === null) {
      set({
        ...state,
        [table]: omit<SyncMeta>(state[table], id),
        dirty: { ...state.dirty, [table]: without(state.dirty[table], id) },
        sampleIds: without(state.sampleIds, id),
      });
      return;
    }
    const updatedAt = stamp(existing.updatedAt);
    putRecord(table, { ...existing, deletedAt: updatedAt, updatedAt });
  }

  function editWorkout(id: string, edit: (w: Workout) => Workout): Workout | null {
    const current = state.workouts[id];
    if (!current || current.deletedAt) return null;
    const next = { ...edit(current), updatedAt: stamp(current.updatedAt) };
    putRecord('workouts', next);
    return next;
  }

  function editExercise(workoutId: string, exerciseRowId: string, edit: (e: WorkoutExercise) => WorkoutExercise) {
    return editWorkout(workoutId, (w) => ({
      ...w,
      exercises: w.exercises.map((e) => (e.id === exerciseRowId ? edit(e) : e)),
    }));
  }

  function buildExercise(def: ExerciseDef, fallbackSets: number, fallbackReps: number): WorkoutExercise {
    const previous = lastPerformance(completedWorkouts(Object.values(state.workouts)), def.id);
    const sets: SetEntry[] =
      previous.length > 0
        ? previous.map((s) => ({ id: uuid(), weightKg: s.weightKg, reps: s.reps, done: false }))
        : Array.from({ length: fallbackSets }, () => ({ id: uuid(), weightKg: 0, reps: fallbackReps, done: false }));
    return { id: uuid(), exerciseId: def.id, name: def.name, muscle: def.muscle, sets };
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Replaces the whole state. Used by the sync engine. */
    replace: set,
    flush: persistNow,
    stamp,

    // ── Workouts ──────────────────────────────────────────────────────────
    startWorkout(options: StartOptions): Workout {
      const existing = activeWorkout(Object.values(state.workouts));
      if (existing) return existing;
      const now = clock();
      let name = 'Workout';
      let exercises: WorkoutExercise[] = [];
      if (options.kind === 'empty') {
        name = options.name ?? defaultName(now);
      } else if (options.kind === 'template') {
        const template = findTemplate(options.templateId);
        if (template) {
          name = template.name;
          exercises = template.items.flatMap((item) => {
            const def = findExercise(item.exerciseId);
            return def ? [buildExercise(def, item.sets, item.reps)] : [];
          });
        }
      } else {
        name = options.workout.name;
        exercises = options.workout.exercises.map((e) => ({
          ...e,
          id: uuid(),
          sets: e.sets.map((s) => ({ ...s, id: uuid(), done: false })),
        }));
      }
      const workout: Workout = {
        id: uuid(),
        name,
        startedAt: now.toISOString(),
        endedAt: null,
        notes: '',
        exercises,
        updatedAt: now.toISOString(),
        deletedAt: null,
      };
      putRecord('workouts', workout);
      return workout;
    },

    renameWorkout: (id: string, name: string) => editWorkout(id, (w) => ({ ...w, name })),
    setNotes: (id: string, notes: string) => editWorkout(id, (w) => ({ ...w, notes })),

    addExercise(workoutId: string, def: ExerciseDef) {
      return editWorkout(workoutId, (w) => ({ ...w, exercises: [...w.exercises, buildExercise(def, 3, 0)] }));
    },

    removeExercise(workoutId: string, exerciseRowId: string) {
      return editWorkout(workoutId, (w) => ({ ...w, exercises: w.exercises.filter((e) => e.id !== exerciseRowId) }));
    },

    addSet(workoutId: string, exerciseRowId: string) {
      return editExercise(workoutId, exerciseRowId, (e) => {
        const last = e.sets[e.sets.length - 1];
        return {
          ...e,
          sets: [...e.sets, { id: uuid(), weightKg: last?.weightKg ?? 0, reps: last?.reps ?? 0, done: false }],
        };
      });
    },

    updateSet(workoutId: string, exerciseRowId: string, setId: string, patch: Partial<Omit<SetEntry, 'id'>>) {
      return editExercise(workoutId, exerciseRowId, (e) => ({
        ...e,
        sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
      }));
    },

    removeSet(workoutId: string, exerciseRowId: string, setId: string) {
      return editExercise(workoutId, exerciseRowId, (e) => ({ ...e, sets: e.sets.filter((s) => s.id !== setId) }));
    },

    /**
     * Ends the session. Unticked sets are dropped; a session with nothing
     * completed is discarded and null is returned.
     */
    finishWorkout(id: string): Workout | null {
      const current = state.workouts[id];
      if (!current || current.deletedAt || current.endedAt) return null;
      const exercises = current.exercises
        .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done && s.reps > 0) }))
        .filter((e) => e.sets.length > 0);
      if (exercises.length === 0) {
        removeRecord('workouts', id);
        return null;
      }
      return editWorkout(id, (w) => ({ ...w, exercises, endedAt: clock().toISOString() }));
    },

    deleteWorkout: (id: string) => removeRecord('workouts', id),

    // ── Body weight ───────────────────────────────────────────────────────
    logBody(date: string, rawWeightKg: number): BodyEntry {
      // Two decimals: the precision the database column stores.
      const weightKg = Math.round(rawWeightKg * 100) / 100;
      const existing = Object.values(state.body).find((e) => e.date === date && !e.deletedAt);
      const entry: BodyEntry = existing
        ? { ...existing, weightKg, updatedAt: stamp(existing.updatedAt) }
        : { id: uuid(), date, weightKg, updatedAt: stamp(), deletedAt: null };
      putRecord('body', entry);
      return entry;
    },

    deleteBody: (id: string) => removeRecord('body', id),

    // ── Settings ──────────────────────────────────────────────────────────
    updateSettings(patch: Partial<Omit<Settings, 'updatedAt'>>) {
      const syncedChange = (['units', 'weeklyGoal', 'restSeconds'] as const).some(
        (key) => key in patch && patch[key] !== state.settings[key],
      );
      set({
        ...state,
        settings: {
          ...state.settings,
          ...patch,
          updatedAt: syncedChange ? stamp(state.settings.updatedAt) : state.settings.updatedAt,
        },
        dirty: { ...state.dirty, settings: state.dirty.settings || syncedChange },
      });
    },

    // ── Bulk operations ───────────────────────────────────────────────────
    /** Adds records (sample data or an import). Newer local versions are kept. */
    mergeRecords(workouts: Workout[], body: BodyEntry[], markAsSample = false): { workouts: number; body: number } {
      const nextWorkouts = { ...state.workouts };
      const nextBody = { ...state.body };
      const dirtyWorkouts = new Set(state.dirty.workouts);
      const dirtyBody = new Set(state.dirty.body);
      const added = { workouts: 0, body: 0 };
      const sample = new Set(state.sampleIds);
      for (const w of workouts) {
        const local = nextWorkouts[w.id];
        if (local && local.updatedAt >= w.updatedAt) continue;
        nextWorkouts[w.id] = w;
        dirtyWorkouts.add(w.id);
        if (markAsSample) sample.add(w.id);
        added.workouts += 1;
      }
      for (const b of body) {
        const local = nextBody[b.id];
        if (local && local.updatedAt >= b.updatedAt) continue;
        nextBody[b.id] = b;
        dirtyBody.add(b.id);
        if (markAsSample) sample.add(b.id);
        added.body += 1;
      }
      set({
        ...state,
        workouts: nextWorkouts,
        body: nextBody,
        dirty: { ...state.dirty, workouts: [...dirtyWorkouts], body: [...dirtyBody] },
        sampleIds: [...sample],
      });
      return added;
    },

    clearSample() {
      for (const id of [...state.sampleIds]) {
        if (state.workouts[id]) removeRecord('workouts', id);
        else if (state.body[id]) removeRecord('body', id);
      }
      set({ ...state, sampleIds: [] });
    },

    exportData(): ExportFile {
      const live = <T extends SyncMeta>(records: Record<string, T>) => Object.values(records).filter((r) => !r.deletedAt);
      return {
        app: 'cadence',
        version: 1,
        exportedAt: clock().toISOString(),
        settings: {
          units: state.settings.units,
          weeklyGoal: state.settings.weeklyGoal,
          restSeconds: state.settings.restSeconds,
        },
        workouts: live(state.workouts).sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
        body: live(state.body).sort((a, b) => a.date.localeCompare(b.date)),
      };
    },

    /** Imports a file produced by exportData. Throws with a readable message when the file is not one. */
    importData(json: string): { workouts: number; body: number } {
      const parsed = parseExport(json);
      return this.mergeRecords(parsed.workouts, parsed.body);
    },

    /** Erases everything stored on this device. */
    resetAll() {
      set(initialState());
      persistNow();
    },
  };
}

export type Store = ReturnType<typeof createStore>;

function defaultName(now: Date): string {
  const hour = now.getHours();
  const part = hour < 11 ? 'Morning' : hour < 14 ? 'Midday' : hour < 18 ? 'Afternoon' : 'Evening';
  return `${part} session`;
}

function load(storage: StorageLike | null): AppState {
  const base = initialState();
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (parsed.version !== 1 || typeof parsed.workouts !== 'object' || parsed.workouts === null) return base;
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...parsed.settings },
      dirty: { ...base.dirty, ...parsed.dirty },
      sync: { ...base.sync, ...parsed.sync, cursors: { ...base.sync.cursors, ...parsed.sync?.cursors } },
      body: parsed.body ?? {},
      sampleIds: parsed.sampleIds ?? [],
    };
  } catch {
    return base;
  }
}

// ── Import validation ───────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MUSCLE_SET = new Set(['chest', 'back', 'shoulders', 'arms', 'legs', 'core']);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function fail(message: string): never {
  throw new Error(message);
}

export function parseExport(json: string): { workouts: Workout[]; body: BodyEntry[] } {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    fail('That file is not valid JSON.');
  }
  if (!isObject(data) || data.app !== 'cadence' || data.version !== 1) {
    fail('That file is not a Cadence export.');
  }
  const workoutsIn = Array.isArray(data.workouts) ? data.workouts : [];
  const bodyIn = Array.isArray(data.body) ? data.body : [];

  const workouts = workoutsIn.map((w, i): Workout => {
    const where = `Workout ${i + 1}`;
    if (!isObject(w) || typeof w.id !== 'string' || !UUID.test(w.id)) fail(`${where} has no valid id.`);
    if (!isIso(w.startedAt)) fail(`${where} has no valid start time.`);
    if (!Array.isArray(w.exercises)) fail(`${where} has no exercise list.`);
    const exercises = w.exercises.map((e): WorkoutExercise => {
      if (!isObject(e) || typeof e.name !== 'string' || !Array.isArray(e.sets)) fail(`${where} has a malformed exercise.`);
      const muscle = typeof e.muscle === 'string' && MUSCLE_SET.has(e.muscle) ? (e.muscle as WorkoutExercise['muscle']) : 'core';
      return {
        id: typeof e.id === 'string' ? e.id : uuid(),
        exerciseId: typeof e.exerciseId === 'string' ? e.exerciseId : 'custom-exercise',
        name: e.name.slice(0, 120),
        muscle,
        sets: e.sets.map((s): SetEntry => {
          if (!isObject(s) || !isCount(s.weightKg) || !isCount(s.reps)) fail(`${where} has a malformed set.`);
          return { id: typeof s.id === 'string' ? s.id : uuid(), weightKg: s.weightKg, reps: Math.round(s.reps), done: s.done !== false };
        }),
      };
    });
    return {
      id: w.id.toLowerCase(),
      name: typeof w.name === 'string' && w.name.trim() ? w.name.slice(0, 120) : 'Workout',
      startedAt: new Date(w.startedAt).toISOString(),
      endedAt: isIso(w.endedAt) ? new Date(w.endedAt).toISOString() : new Date(w.startedAt).toISOString(),
      notes: typeof w.notes === 'string' ? w.notes.slice(0, 4000) : '',
      exercises,
      updatedAt: isIso(w.updatedAt) ? new Date(w.updatedAt).toISOString() : new Date(w.startedAt).toISOString(),
      deletedAt: null,
    };
  });

  const body = bodyIn.map((b, i): BodyEntry => {
    const where = `Body weight entry ${i + 1}`;
    if (!isObject(b) || typeof b.id !== 'string' || !UUID.test(b.id)) fail(`${where} has no valid id.`);
    if (typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) fail(`${where} has no valid date.`);
    if (!isCount(b.weightKg) || b.weightKg <= 0 || b.weightKg >= 500) fail(`${where} has no valid weight.`);
    return {
      id: b.id.toLowerCase(),
      date: b.date,
      weightKg: b.weightKg,
      updatedAt: isIso(b.updatedAt) ? new Date(b.updatedAt).toISOString() : `${b.date}T12:00:00.000Z`,
      deletedAt: null,
    };
  });

  return { workouts, body };
}

/** localStorage, or null where the browser blocks it. */
export function browserStorage(): StorageLike | null {
  try {
    const probe = '__cadence_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}
