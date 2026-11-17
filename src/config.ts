/**
 * Everything here is public by design: it ships in the browser bundle.
 * The Supabase anon key only grants what row-level security allows, and a
 * Sentry DSN can only submit events. Real secrets never belong in VITE_ vars.
 */
const env = import.meta.env;
const clean = (value: string | undefined) => (value ?? '').trim();

export const config = {
  supabaseUrl: clean(env.VITE_SUPABASE_URL).replace(/\/+$/, ''),
  supabaseAnonKey: clean(env.VITE_SUPABASE_ANON_KEY),
  sentryDsn: clean(env.VITE_SENTRY_DSN),
  environment: clean(env.VITE_ENVIRONMENT) || env.MODE,
  /** owner/name of the GitHub repository, used by the status page. */
  githubRepo: clean(env.VITE_GITHUB_REPO),
  version: __APP_VERSION__,
  commit: __APP_COMMIT__,
  release: __APP_RELEASE__,
  builtAt: __APP_BUILT_AT__,
};

export const cloudConfigured = config.supabaseUrl !== '' && config.supabaseAnonKey !== '';
export const monitoringConfigured = config.sentryDsn !== '';
