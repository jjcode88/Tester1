import type { SupabaseClient } from '@supabase/supabase-js';
import type { PulledRow, Remote, SyncedSettings, SyncRecord } from './sync';
import type { BodyEntry, Cursor, SyncTable, Units, Workout, WorkoutExercise } from './types';

interface WorkoutRow {
  id: string;
  name: string;
  started_at: string;
  ended_at: string | null;
  notes: string;
  exercises: WorkoutExercise[];
  updated_at: string;
  deleted_at: string | null;
  server_updated_at?: string;
}

interface BodyRow {
  id: string;
  measured_on: string;
  weight_kg: number;
  updated_at: string;
  deleted_at: string | null;
  server_updated_at?: string;
}

const TABLE_NAME: Record<SyncTable, string> = { workouts: 'workouts', body: 'body_metrics' };

// Postgres returns timestamps as "2026-11-16T18:00:00+00:00"; the app compares
// ISO strings, so everything is normalised to the "…Z" form on the way in.
const iso = (value: string) => new Date(value).toISOString();
const isoOrNull = (value: string | null) => (value ? iso(value) : null);

export function workoutToRow(w: Workout): WorkoutRow {
  return {
    id: w.id,
    name: w.name.trim().slice(0, 120) || 'Workout',
    started_at: w.startedAt,
    ended_at: w.endedAt,
    notes: w.notes.slice(0, 4000),
    exercises: w.exercises,
    updated_at: w.updatedAt,
    deleted_at: w.deletedAt,
  };
}

export function rowToWorkout(row: WorkoutRow): Workout {
  return {
    id: row.id,
    name: row.name,
    startedAt: iso(row.started_at),
    endedAt: isoOrNull(row.ended_at),
    notes: row.notes ?? '',
    exercises: Array.isArray(row.exercises) ? row.exercises : [],
    updatedAt: iso(row.updated_at),
    deletedAt: isoOrNull(row.deleted_at),
  };
}

export function bodyToRow(b: BodyEntry): BodyRow {
  return { id: b.id, measured_on: b.date, weight_kg: b.weightKg, updated_at: b.updatedAt, deleted_at: b.deletedAt };
}

export function rowToBody(row: BodyRow): BodyEntry {
  return {
    id: row.id,
    date: row.measured_on,
    weightKg: Number(row.weight_kg),
    updatedAt: iso(row.updated_at),
    deletedAt: isoOrNull(row.deleted_at),
  };
}

/**
 * PostgREST filter for "strictly after this point in the change feed", ordered
 * by (server_updated_at, id). Values are double-quoted because timestamps
 * contain characters the filter grammar reserves.
 */
export function afterCursorFilter(after: Cursor): string {
  const at = `"${after.at}"`;
  return `server_updated_at.gt.${at},and(server_updated_at.eq.${at},id.gt."${after.id}")`;
}

function check(error: { message: string; code?: string } | null, action: string): void {
  if (error) throw new Error(`${action} failed: ${error.message}${error.code ? ` (${error.code})` : ''}`);
}

/** The Supabase-backed side of the sync engine. */
export function createSupabaseRemote(client: SupabaseClient, userId: string): Remote {
  return {
    async push(table: SyncTable, records: SyncRecord[]): Promise<void> {
      const rows: Array<Record<string, unknown>> =
        table === 'workouts'
          ? (records as Workout[]).map((w) => ({ ...workoutToRow(w) }))
          : (records as BodyEntry[]).map((b) => ({ ...bodyToRow(b) }));
      const { error } = await client.from(TABLE_NAME[table]).upsert(rows, { onConflict: 'id' });
      check(error, `Uploading ${table}`);
    },

    async pull(table: SyncTable, after: Cursor | null, limit: number): Promise<PulledRow[]> {
      let query = client
        .from(TABLE_NAME[table])
        .select('*')
        .order('server_updated_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(limit);
      if (after) query = query.or(afterCursorFilter(after));
      const { data, error } = await query;
      check(error, `Downloading ${table}`);
      return (data ?? []).map((row) => ({
        record: table === 'workouts' ? rowToWorkout(row as WorkoutRow) : rowToBody(row as BodyRow),
        // Kept verbatim: the server's microsecond precision matters for paging.
        cursor: { at: String(row.server_updated_at), id: String(row.id) },
      }));
    },

    async getSettings(): Promise<SyncedSettings | null> {
      const { data, error } = await client
        .from('profiles')
        .select('units, weekly_goal, rest_seconds, updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      check(error, 'Loading settings');
      if (!data) return null;
      return {
        units: data.units as Units,
        weeklyGoal: Number(data.weekly_goal),
        restSeconds: Number(data.rest_seconds),
        updatedAt: iso(String(data.updated_at)),
      };
    },

    async putSettings(settings: SyncedSettings): Promise<void> {
      const { error } = await client.from('profiles').upsert(
        {
          user_id: userId,
          units: settings.units,
          weekly_goal: settings.weeklyGoal,
          rest_seconds: settings.restSeconds,
          updated_at: settings.updatedAt,
        },
        { onConflict: 'user_id' },
      );
      check(error, 'Saving settings');
    },
  };
}
