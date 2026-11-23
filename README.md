# Cadence

A strength training log that runs in the browser. Log sessions set by set, see
your volume, estimated one-rep maxes, body weight trend and records, and use
the plate and 1RM calculators between sets.

It works with no account and no network: everything is saved on the device
first. Connect the services below and it gains cross-device sync, error
tracking and uptime monitoring, each one optional and each one visible on the
app's own **Status** page.

| Service | What it does here | Where it lives |
| --- | --- | --- |
| **GitHub Actions** | Lints, type-checks, unit-tests, tests the database policies on real Postgres, drives the app in Chromium on desktop and phone sizes, then deploys | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |
| **GitHub Pages** | Hosts the built site, plus a `health.json` that names the exact commit being served | `deploy` job in `ci.yml` |
| **Supabase** | Accounts (password or email link) and a Postgres database with row-level security; two-way sync between devices | [`supabase/`](supabase), [`src/lib/sync.ts`](src/lib/sync.ts) |
| **Sentry** | Unhandled errors and failed syncs, tagged with the release and commit, with source maps uploaded at build time | [`src/lib/monitoring.ts`](src/lib/monitoring.ts) |
| **Uptime monitor** | Checks the live site every 15 minutes; opens an `incident` issue when it goes down and closes it when it recovers | [`.github/workflows/uptime.yml`](.github/workflows/uptime.yml) |

## Backups

Without an account, workouts live only in the browser that logged them.
**Account → Back up now** saves everything to one file: on a phone it opens the
share sheet (choose *Save to Files → iCloud Drive*, or Google Drive), and on a
computer it downloads. **Restore a backup** loads it on any device. If there is
new training and no backup for a week, the Today screen reminds you.

## Run it locally

```bash
npm install
npm run dev          # http://localhost:5173
```

Open it and choose **Load sample data** to see ten weeks of example training.

```bash
npm run check        # lint + types + unit tests + build
npm run test:e2e     # browser tests against the production build
DATABASE_URL=postgres://… npm run test:db   # schema and RLS tests on any empty Postgres 15+
```

## How sync works

The device is the source of truth while you train; the server is where devices
meet. Every record carries three timestamps:

- `updated_at` is set by the device on each edit and settles conflicts: the
  later edit wins, per record.
- `server_updated_at` is set by Postgres on every accepted write and orders a
  change feed. Each device remembers how far through the feed it has read and
  pages forward with a keyset cursor, re-reading a 30-second overlap so a
  transaction that committed late is never skipped.
- `deleted_at` marks a deletion so it reaches other devices before the record
  disappears.

A trigger (`sync_guard`) drops any upload older than what the database holds,
so a phone that was offline for a week cannot overwrite newer edits. Signing in
as a different account on the same device clears the previous account's data
first, so two people's logs never mix.

The sync engine is covered by unit tests that run two simulated devices against
an in-memory server with the same rules ([`src/lib/sync.test.ts`](src/lib/sync.test.ts)),
and the schema by SQL tests that sign in as two users and try to read, edit,
forge and delete each other's rows ([`supabase/tests/10_policies.sql`](supabase/tests/10_policies.sql)).

## Deploy to GitHub Pages

1. In the repository, open **Settings → Pages** and set **Source** to
   **GitHub Actions**.
2. Push to the default branch. The `CI` workflow tests, builds and deploys, then
   checks the live `health.json`.

The site is published at `https://<owner>.github.io/<repo>/`.

## Connect Supabase, Sentry, Cloudflare, Resend and UptimeRobot

Step-by-step instructions, written for people who have never done it before,
are in **[docs/SETUP.md](docs/SETUP.md)**.

## Uptime monitoring

Nothing to set up: once Pages is live, `uptime.yml` checks `health.json` every
15 minutes (three attempts before it calls the site down). The check passes
only if the response is a real Cadence health report, so an error page served
with status 200 still counts as down. To monitor a custom domain instead, set
the `SITE_URL` repository variable.

Outages open an issue labelled `incident`; anyone watching the repository is
notified. The issue closes itself, with the outage length, on recovery. The
in-app Status page shows the last 60 checks and recent incidents from GitHub's
public API.

GitHub runs scheduled workflows on the default branch only, and pauses them in
repositories with no activity for 60 days.

## Automatic updates

Dependabot checks every week for newer versions of the libraries and GitHub
Actions the project uses. Small updates (patch and minor versions) are merged
by [`auto-update.yml`](.github/workflows/auto-update.yml) once the whole test
suite passes, and then published. Major versions, which can change behaviour,
stay open with a `needs-review` label. The rule is
[`scripts/update-policy.mjs`](scripts/update-policy.mjs).

## Project layout

```
src/
  lib/          data model, analytics, store, sync engine, Supabase and Sentry adapters (+ tests)
  views/        Today, Workout, History, Progress, Tools, Account, Status
  components/   charts, barbell graphics, shared controls
supabase/
  migrations/   schema, RLS policies, sync trigger, reporting views
  tests/        SQL tests for the policies, runnable on plain Postgres
e2e/            Playwright tests
scripts/        health check used by CI and the uptime monitor
```
