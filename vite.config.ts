import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

function git(command: string): string | null {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch {
    return null;
  }
}

const commit = process.env.GITHUB_SHA ?? git('git rev-parse HEAD') ?? 'development';
const release = `cadence@${pkg.version}+${commit.slice(0, 7)}`;
const builtAt = new Date().toISOString();

/**
 * Serves /health.json — the endpoint uptime monitors poll. It is generated at
 * build time so a successful response proves the deployed bundle is the one
 * the monitor expects, not just that the host answers.
 */
function healthEndpoint(): Plugin {
  const body = () =>
    JSON.stringify({ status: 'ok', app: 'cadence', version: pkg.version, commit, release, builtAt }, null, 2);
  return {
    name: 'cadence-health',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0]?.endsWith('/health.json')) {
          res.setHeader('Content-Type', 'application/json');
          res.end(body());
        } else {
          next();
        }
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'health.json', source: body() });
    },
  };
}

// Source maps are uploaded to Sentry only when CI provides credentials.
const sentryUpload =
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
    ? sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        release: {
          name: release,
          setCommits: { auto: true, ignoreMissing: true },
          deploy: { env: process.env.VITE_ENVIRONMENT || 'production' },
        },
        // Maps go to Sentry for readable stack traces, not to the public site.
        sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
        telemetry: false,
      })
    : null;

export default defineConfig({
  // Relative asset paths: the same build works at a domain root, under
  // /<repo>/ on GitHub Pages, or opened from any sub-path.
  base: './',
  plugins: [react(), healthEndpoint(), sentryUpload],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_RELEASE__: JSON.stringify(release),
    __APP_BUILT_AT__: JSON.stringify(builtAt),
  },
  build: {
    // Reaches back to iOS 14 Safari, so older iPhones that haven't updated still run the app.
    target: ['es2020', 'safari14', 'chrome87', 'firefox78', 'edge88'],
    sourcemap: true,
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
});
