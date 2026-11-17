import type { PulledRow, Remote, SyncedSettings, SyncRecord } from './sync';
import type { Cursor, SyncTable } from './types';

interface Row {
  record: SyncRecord;
  at: number;
}

/**
 * An in-memory server with the same rules as the Postgres schema in
 * supabase/migrations: upsert by id, stale writes ignored, every accepted
 * write stamped with a server clock, and a keyset-ordered change feed.
 */
export class FakeRemote implements Remote {
  tables: Record<SyncTable, Map<string, Row>> = { workouts: new Map(), body: new Map() };
  settings: SyncedSettings | null = null;
  clock = Date.parse('2026-11-16T10:00:00.000Z');
  /** When true, a whole batch shares one timestamp, like rows written in one statement with now(). */
  sameStampPerBatch = false;
  calls = { push: 0, pull: 0 };
  beforePush: ((table: SyncTable, records: SyncRecord[]) => void) | null = null;
  failNextPull: Error | null = null;

  private stamp(): number {
    this.clock += 1;
    return this.clock;
  }

  async push(table: SyncTable, records: SyncRecord[]): Promise<void> {
    this.calls.push += 1;
    this.beforePush?.(table, records);
    const batchStamp = this.stamp();
    for (const record of records) {
      const existing = this.tables[table].get(record.id);
      if (existing && Date.parse(record.updatedAt) < Date.parse(existing.record.updatedAt)) continue;
      this.tables[table].set(record.id, {
        record: structuredClone(record),
        at: this.sameStampPerBatch ? batchStamp : this.stamp(),
      });
    }
  }

  async pull(table: SyncTable, after: Cursor | null, limit: number): Promise<PulledRow[]> {
    this.calls.pull += 1;
    if (this.failNextPull) {
      const error = this.failNextPull;
      this.failNextPull = null;
      throw error;
    }
    const afterAt = after ? Date.parse(after.at) : -Infinity;
    return [...this.tables[table].values()]
      .filter((row) => row.at > afterAt || (row.at === afterAt && after !== null && row.record.id > after.id))
      .sort((a, b) => a.at - b.at || a.record.id.localeCompare(b.record.id))
      .slice(0, limit)
      .map((row) => ({
        record: structuredClone(row.record),
        cursor: { at: new Date(row.at).toISOString().replace('Z', '+00:00'), id: row.record.id },
      }));
  }

  async getSettings(): Promise<SyncedSettings | null> {
    return this.settings ? { ...this.settings } : null;
  }

  async putSettings(settings: SyncedSettings): Promise<void> {
    if (this.settings && Date.parse(settings.updatedAt) < Date.parse(this.settings.updatedAt)) return;
    this.settings = { ...settings };
  }

  /** Writes a row with an explicit server timestamp, as a late-committing transaction would. */
  insertAt(table: SyncTable, record: SyncRecord, at: number) {
    this.tables[table].set(record.id, { record: structuredClone(record), at });
  }
}

/** A clock tests can move by hand. */
export function manualClock(start = '2026-11-16T12:00:00.000Z') {
  let now = Date.parse(start);
  const clock = () => new Date(now);
  clock.advance = (ms: number) => {
    now += ms;
  };
  return clock;
}
