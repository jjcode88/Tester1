import type { Store } from './store';
import { EPOCH } from './store';
import type { AppState, BodyEntry, Cursor, Settings, SyncMeta, SyncTable, Workout } from './types';

export type SyncRecord = Workout | BodyEntry;
export type SyncedSettings = Pick<Settings, 'units' | 'weeklyGoal' | 'restSeconds' | 'updatedAt'>;

export interface PulledRow {
  record: SyncRecord;
  /** Position of this row in the server's change feed. */
  cursor: Cursor;
}

/**
 * The server side of sync. The Supabase adapter implements this; tests use an
 * in-memory fake with the same semantics.
 */
export interface Remote {
  /** Upserts by id. The server ignores a row older than the one it holds. */
  push(table: SyncTable, records: SyncRecord[]): Promise<void>;
  /** Rows changed after `after`, in change order, at most `limit`. */
  pull(table: SyncTable, after: Cursor | null, limit: number): Promise<PulledRow[]>;
  getSettings(): Promise<SyncedSettings | null>;
  putSettings(settings: SyncedSettings): Promise<void>;
}

export interface SyncOptions {
  pageSize?: number;
  batchSize?: number;
  /**
   * How far each pull rewinds behind the saved cursor. A row whose transaction
   * committed late can carry a timestamp slightly behind the cursor; re-reading
   * a short window picks it up, and merging is idempotent.
   */
  overlapMs?: number;
  now?: () => Date;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
}

const TABLES: SyncTable[] = ['workouts', 'body'];
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const time = (iso: string) => Date.parse(iso);

/**
 * Points the local data at an account.
 * - First sign-in on this device: everything local is queued for upload.
 * - Same account as before: nothing changes.
 * - A different account: the previous account's data is removed from the
 *   device first, so two people's logs never mix.
 */
export function bindUser(state: AppState, userId: string): AppState {
  if (state.sync.userId === userId) return state;
  const fresh = { userId, cursors: { workouts: null, body: null }, lastSyncedAt: null };
  if (state.sync.userId === null) {
    return {
      ...state,
      dirty: {
        workouts: Object.keys(state.workouts),
        body: Object.keys(state.body),
        settings: state.settings.updatedAt !== EPOCH,
      },
      sync: fresh,
    };
  }
  return {
    ...state,
    workouts: {},
    body: {},
    settings: { ...state.settings, updatedAt: EPOCH },
    dirty: { workouts: [], body: [], settings: false },
    sync: fresh,
    sampleIds: [],
  };
}

/** After a push: clear the dirty flag unless the record changed while in flight. */
export function confirmPushed(state: AppState, table: SyncTable, pushed: SyncRecord[]): AppState {
  const records: Record<string, SyncMeta> = { ...state[table] };
  const dirty = new Set(state.dirty[table]);
  for (const sent of pushed) {
    const current = records[sent.id];
    if (!current) {
      dirty.delete(sent.id);
    } else if (current.updatedAt === sent.updatedAt) {
      dirty.delete(sent.id);
      // A confirmed tombstone has done its job locally.
      if (current.deletedAt) delete records[sent.id];
    }
  }
  return { ...state, [table]: records, dirty: { ...state.dirty, [table]: [...dirty] } };
}

/** Applies pulled rows: the later `updatedAt` wins, record by record. */
export function mergePulled(state: AppState, table: SyncTable, rows: PulledRow[]): { state: AppState; applied: number } {
  if (rows.length === 0) return { state, applied: 0 };
  const records: Record<string, SyncMeta> = { ...state[table] };
  const dirty = new Set(state.dirty[table]);
  let applied = 0;
  for (const { record: remote } of rows) {
    const local = records[remote.id];
    if (!local) {
      if (!remote.deletedAt) {
        records[remote.id] = remote;
        applied += 1;
      }
      continue;
    }
    const diff = time(remote.updatedAt) - time(local.updatedAt);
    if (diff > 0) {
      if (remote.deletedAt) delete records[remote.id];
      else records[remote.id] = remote;
      dirty.delete(remote.id);
      applied += 1;
    } else if (diff < 0) {
      // Local is newer than what the server holds: make sure it gets sent.
      dirty.add(remote.id);
    }
  }
  return {
    state: { ...state, [table]: records, dirty: { ...state.dirty, [table]: [...dirty] } },
    applied,
  };
}

function rewind(cursor: Cursor | null, overlapMs: number): Cursor | null {
  if (!cursor) return null;
  return { at: new Date(time(cursor.at) - overlapMs).toISOString(), id: NIL_UUID };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * One full round trip: upload local changes, download remote ones, reconcile
 * settings. Safe to call repeatedly and to interrupt — every step leaves the
 * store consistent, and anything not confirmed is retried next time.
 */
export async function syncOnce(store: Store, remote: Remote, userId: string, options: SyncOptions = {}): Promise<SyncResult> {
  const { pageSize = 500, batchSize = 100, overlapMs = 30_000, now = () => new Date() } = options;
  const result: SyncResult = { pushed: 0, pulled: 0 };

  store.replace(bindUser(store.getState(), userId));

  for (const table of TABLES) {
    // Push first, so the server's stale-write guard sees our edits before we read back.
    const pending = store
      .getState()
      .dirty[table].map((id) => store.getState()[table][id])
      .filter((r): r is SyncRecord => r !== undefined);
    const orphaned = store.getState().dirty[table].filter((id) => !store.getState()[table][id]);
    if (orphaned.length > 0) {
      const s = store.getState();
      store.replace({ ...s, dirty: { ...s.dirty, [table]: s.dirty[table].filter((id) => !orphaned.includes(id)) } });
    }
    for (const batch of chunk(pending, batchSize)) {
      await remote.push(table, batch);
      store.replace(confirmPushed(store.getState(), table, batch));
      result.pushed += batch.length;
    }

    let after = rewind(store.getState().sync.cursors[table], overlapMs);
    let last: Cursor | null = null;
    for (;;) {
      const page = await remote.pull(table, after, pageSize);
      const merged = mergePulled(store.getState(), table, page);
      store.replace(merged.state);
      result.pulled += merged.applied;
      if (page.length > 0) {
        last = page[page.length - 1]!.cursor;
        after = last;
      }
      if (page.length < pageSize) break;
    }
    if (last) {
      const s = store.getState();
      store.replace({ ...s, sync: { ...s.sync, cursors: { ...s.sync.cursors, [table]: last } } });
    }
  }

  const remoteSettings = await remote.getSettings();
  const local = store.getState().settings;
  if (remoteSettings && time(remoteSettings.updatedAt) > time(local.updatedAt)) {
    const s = store.getState();
    store.replace({
      ...s,
      settings: { ...s.settings, ...remoteSettings },
      dirty: { ...s.dirty, settings: false },
    });
  } else if (!remoteSettings || store.getState().dirty.settings) {
    const sent: SyncedSettings = {
      units: local.units,
      weeklyGoal: local.weeklyGoal,
      restSeconds: local.restSeconds,
      updatedAt: local.updatedAt,
    };
    await remote.putSettings(sent);
    const s = store.getState();
    if (s.settings.updatedAt === sent.updatedAt) store.replace({ ...s, dirty: { ...s.dirty, settings: false } });
  }

  const s = store.getState();
  store.replace({ ...s, sync: { ...s.sync, lastSyncedAt: now().toISOString() } });
  store.flush();
  return result;
}

/** Number of local changes waiting to be uploaded. */
export function pendingCount(state: AppState): number {
  return state.dirty.workouts.length + state.dirty.body.length + (state.dirty.settings ? 1 : 0);
}
