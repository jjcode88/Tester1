import { config, monitoringConfigured } from '../config';

type Sentry = typeof import('@sentry/react');
type Context = Record<string, string | number | boolean | null | undefined>;

let sentry: Sentry | null = null;
let loading: Promise<void> | null = null;
/** Calls made before the SDK finished loading are replayed once it has. */
const backlog: Array<(s: Sentry) => void> = [];

function run(action: (s: Sentry) => void) {
  if (sentry) action(sentry);
  else if (monitoringConfigured && backlog.length < 50) backlog.push(action);
}

/**
 * Starts Sentry when a DSN is configured. The SDK is a separate chunk, so a
 * deployment without error tracking never downloads it.
 */
export function initMonitoring(): Promise<void> {
  if (!monitoringConfigured) return Promise.resolve();
  loading ??= import('@sentry/react')
    .then((s) => {
      s.init({
        dsn: config.sentryDsn,
        environment: config.environment,
        release: config.release,
        integrations: [s.browserTracingIntegration()],
        // Performance traces for a fifth of sessions; every error is sent.
        tracesSampleRate: 0.2,
        // Training data stays out of error reports: the SDK collects none of
        // the request details it would gather by default.
        dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
        ignoreErrors: ['ResizeObserver loop limit exceeded', 'ResizeObserver loop completed'],
      });
      s.setTag('commit', config.commit.slice(0, 7));
      sentry = s;
      for (const action of backlog.splice(0)) action(s);
    })
    .catch((error: unknown) => {
      console.warn('Error tracking failed to start', error);
    });
  return loading;
}

/** Reports a handled error. Always logs to the console as well. */
export function captureError(error: unknown, context: Context = {}): void {
  console.error(error, context);
  run((s) =>
    s.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) scope.setTag(key, String(value));
      s.captureException(error);
    }),
  );
}

export function breadcrumb(category: string, message: string, data?: Context): void {
  run((s) => s.addBreadcrumb({ category, message, data, level: 'info' }));
}

/** Ties errors to an account by id only — never an email address. */
export function setMonitoringUser(id: string | null): void {
  run((s) => s.setUser(id ? { id } : null));
}

/** Sends a deliberate test event and resolves once it has left the browser. */
export async function sendTestError(): Promise<string | null> {
  await initMonitoring();
  if (!sentry) return null;
  const id = sentry.captureException(new Error(`Cadence test error (${new Date().toISOString()})`), {
    tags: { test: 'true' },
  });
  await sentry.flush(4000);
  return id;
}

export function monitoringStatus() {
  return {
    configured: monitoringConfigured,
    active: sentry !== null,
    environment: config.environment,
    release: config.release,
  };
}
