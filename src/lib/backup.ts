import { dayKey } from './dates';
import type { AppState } from './types';

const DAY_MS = 86_400_000;
export const BACKUP_REMINDER_DAYS = 7;

export function backupFileName(now: Date): string {
  return `cadence-backup-${dayKey(now)}.json`;
}

/**
 * Whether to nudge for a backup: there is real training on this device that
 * no backup or cloud account holds yet, and the last backup is over a week old.
 */
export function backupDue(state: AppState, now: Date, syncedToCloud: boolean): boolean {
  if (syncedToCloud) return false;
  const sample = new Set(state.sampleIds);
  const own = Object.values(state.workouts).filter((w) => !w.deletedAt && w.endedAt && !sample.has(w.id));
  if (own.length === 0) return false;
  const last = state.settings.lastBackupAt;
  if (!last) return true;
  const changedSince = own.some((w) => w.updatedAt > last);
  return changedSince && now.getTime() - Date.parse(last) > BACKUP_REMINDER_DAYS * DAY_MS;
}

export type BackupOutcome = 'shared' | 'downloaded' | 'cancelled';

/**
 * Hands the backup to the system share sheet where the browser supports
 * sharing files (iPhone and Android: Save to Files, iCloud Drive, Google
 * Drive, AirDrop, email…), and downloads it everywhere else.
 */
export async function saveBackup(json: string, now: Date): Promise<BackupOutcome> {
  const name = backupFileName(now);
  const file = new File([json], name, { type: 'application/json' });
  const shareable = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  if (shareable) {
    try {
      await navigator.share({ files: [file], title: 'Cadence backup' });
      return 'shared';
    } catch (error) {
      // The person closed the share sheet.
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // Any other refusal: fall through to a plain download.
    }
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
