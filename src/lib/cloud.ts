import type { SupabaseClient } from '@supabase/supabase-js';
import { cloudConfigured, config } from '../config';
import { breadcrumb, captureError, setMonitoringUser } from './monitoring';
import type { Store } from './store';
import { pendingCount, syncOnce } from './sync';
import type { SyncResult } from './sync';

export type CloudPhase =
  | 'unconfigured' // this deployment has no Supabase project
  | 'starting'
  | 'signed-out'
  | 'idle' // signed in, nothing in flight
  | 'syncing'
  | 'offline'
  | 'error';

export interface CloudStatus {
  phase: CloudPhase;
  userId: string | null;
  email: string | null;
  error: string | null;
  lastResult: SyncResult | null;
}

const RETRY_STEPS_MS = [15_000, 30_000, 60_000, 300_000];

/**
 * Owns the Supabase session and decides when to sync: after sign-in, shortly
 * after local edits, when the tab regains focus or the network returns, and
 * with backoff after a failure.
 */
export function createCloud(store: Store) {
  let status: CloudStatus = {
    phase: cloudConfigured ? 'starting' : 'unconfigured',
    userId: null,
    email: null,
    error: null,
    lastResult: null,
  };
  const listeners = new Set<() => void>();
  let client: SupabaseClient | null = null;
  let running = false;
  let queued = false;
  let failures = 0;
  let editTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let lastAttempt = 0;

  function update(patch: Partial<CloudStatus>) {
    status = { ...status, ...patch };
    for (const listener of listeners) listener();
  }

  async function getClient(): Promise<SupabaseClient> {
    if (client) return client;
    // Loaded on demand: a local-only deployment never downloads the SDK.
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    return client;
  }

  async function runSync() {
    if (!status.userId || !client) return;
    if (running) {
      queued = true;
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      update({ phase: 'offline' });
      return;
    }
    running = true;
    lastAttempt = Date.now();
    update({ phase: 'syncing', error: null });
    const userId = status.userId;
    try {
      const { createSupabaseRemote } = await import('./supabaseRemote');
      const result = await syncOnce(store, createSupabaseRemote(client, userId), userId);
      failures = 0;
      breadcrumb('sync', 'Sync completed', { pushed: result.pushed, pulled: result.pulled });
      if (status.userId === userId) update({ phase: 'idle', lastResult: result });
    } catch (error) {
      failures += 1;
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (!offline) captureError(error, { area: 'sync', attempt: failures });
      if (status.userId === userId) {
        update({
          phase: offline ? 'offline' : 'error',
          error: error instanceof Error ? error.message : 'Sync failed for an unknown reason.',
        });
        const delay = RETRY_STEPS_MS[Math.min(failures - 1, RETRY_STEPS_MS.length - 1)]!;
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(requestSync, delay);
      }
    } finally {
      running = false;
      if (queued) {
        queued = false;
        void runSync();
      }
    }
  }

  function requestSync() {
    void runSync();
  }

  function onSession(userId: string | null, email: string | null) {
    if (userId === status.userId && status.phase !== 'starting') return;
    setMonitoringUser(userId);
    if (!userId) {
      update({ phase: 'signed-out', userId: null, email: null, error: null, lastResult: null });
      return;
    }
    update({ phase: 'idle', userId, email, error: null });
    requestSync();
  }

  return {
    getStatus: () => status,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async start() {
      if (!cloudConfigured) return;
      try {
        const supabase = await getClient();
        supabase.auth.onAuthStateChange((_event, session) => {
          // Deferred: Supabase holds a lock while this callback runs, and
          // syncing from inside it would wait on that same lock.
          setTimeout(() => onSession(session?.user.id ?? null, session?.user.email ?? null), 0);
        });
        const { data } = await supabase.auth.getSession();
        onSession(data.session?.user.id ?? null, data.session?.user.email ?? null);
      } catch (error) {
        captureError(error, { area: 'auth-start' });
        update({ phase: 'error', error: 'Could not reach the sync service.' });
      }

      store.subscribe(() => {
        if (!status.userId || pendingCount(store.getState()) === 0 || editTimer) return;
        editTimer = setTimeout(() => {
          editTimer = null;
          requestSync();
        }, 2500);
      });
      window.addEventListener('online', requestSync);
      window.addEventListener('offline', () => status.userId && update({ phase: 'offline' }));
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Date.now() - lastAttempt > 30_000) requestSync();
      });
      setInterval(() => {
        if (document.visibilityState === 'visible') requestSync();
      }, 120_000);
    },

    requestSync,

    async signIn(email: string, password: string): Promise<void> {
      const supabase = await getClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(friendlyAuthError(error.message));
    },

    /** Returns true when the account still needs its email confirmed. */
    async signUp(email: string, password: string): Promise<boolean> {
      const supabase = await getClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: returnUrl() },
      });
      if (error) throw new Error(friendlyAuthError(error.message));
      return data.session === null;
    },

    async sendMagicLink(email: string): Promise<void> {
      const supabase = await getClient();
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: returnUrl() } });
      if (error) throw new Error(friendlyAuthError(error.message));
    },

    async signOut(): Promise<void> {
      const supabase = await getClient();
      // Local scope: other devices stay signed in.
      await supabase.auth.signOut({ scope: 'local' });
    },

    /** Round-trip time to the Supabase auth service, for the status page. */
    async ping(): Promise<{ ok: boolean; ms: number; detail: string }> {
      const started = performance.now();
      try {
        const response = await fetch(`${config.supabaseUrl}/auth/v1/health`, {
          headers: { apikey: config.supabaseAnonKey },
          cache: 'no-store',
        });
        const ms = Math.round(performance.now() - started);
        return { ok: response.ok, ms, detail: response.ok ? 'Reachable' : `Responded with HTTP ${response.status}` };
      } catch {
        return { ok: false, ms: Math.round(performance.now() - started), detail: 'Not reachable from this browser' };
      }
    },
  };
}

export type Cloud = ReturnType<typeof createCloud>;

/** Where email links should land: this page, without any hash or query. */
function returnUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'That email and password do not match an account.';
  if (m.includes('email not confirmed')) return 'Confirm your email first: open the link we sent you, then sign in.';
  if (m.includes('already registered')) return 'An account with that email already exists. Sign in instead.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Wait a minute and try again.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Could not reach the sync service. Check your connection.';
  return message;
}
