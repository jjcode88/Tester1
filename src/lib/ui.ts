import { useEffect, useState, useSyncExternalStore } from 'react';

// ── Routing ─────────────────────────────────────────────────────────────────
// Plain "#name" hashes only: they work on any static host and never collide
// with the "#access_token=…" fragment Supabase adds after an email link.

export const ROUTES = ['today', 'workout', 'history', 'progress', 'tools', 'account', 'status'] as const;
export type Route = (typeof ROUTES)[number];

function currentRoute(): Route {
  const name = window.location.hash.replace(/^#/, '');
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : 'today';
}

function subscribeToHash(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribeToHash, currentRoute);
}

export function navigate(route: Route) {
  if (currentRoute() === route) return;
  window.location.hash = route;
  window.scrollTo({ top: 0 });
}

// ── Toasts and the post-workout summary ─────────────────────────────────────

export interface Toast {
  id: number;
  message: string;
  tone: 'plain' | 'bad';
}

interface UiState {
  toasts: Toast[];
  /** Workout whose summary sheet is open, if any. */
  summaryId: string | null;
}

let state: UiState = { toasts: [], summaryId: null };
const listeners = new Set<() => void>();
let nextToastId = 1;

function set(next: UiState) {
  state = next;
  for (const listener of listeners) listener();
}

export function useUi(): UiState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => state,
  );
}

export function toast(message: string, tone: Toast['tone'] = 'plain') {
  const id = nextToastId++;
  set({ ...state, toasts: [...state.toasts, { id, message, tone }] });
  setTimeout(() => set({ ...state, toasts: state.toasts.filter((t) => t.id !== id) }), tone === 'bad' ? 6000 : 3500);
}

export function showSummary(workoutId: string | null) {
  set({ ...state, summaryId: workoutId });
}

// ── Small hooks ─────────────────────────────────────────────────────────────

/** Re-renders on an interval; returns the current time. */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
