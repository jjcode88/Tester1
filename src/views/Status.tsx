import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { cloud, useAppState, useCloud } from '../app';
import { Pill } from '../components/common';
import type { Tone } from '../components/common';
import { Icon } from '../components/Icon';
import { cloudConfigured, config, monitoringConfigured } from '../config';
import { fmt, relativeTime } from '../lib/dates';
import { checkSite, fetchGitHubStatus } from '../lib/health';
import type { GitHubStatus, SiteHealth } from '../lib/health';
import { monitoringStatus, sendTestError } from '../lib/monitoring';
import { pendingCount } from '../lib/sync';
import { toast, useNow } from '../lib/ui';

interface Checks {
  site: SiteHealth;
  database: { ok: boolean; ms: number; detail: string } | null;
  github: GitHubStatus;
  at: Date;
}

const repoUrl = config.githubRepo ? `https://github.com/${config.githubRepo}` : null;

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children} <Icon name="external" size={13} />
    </a>
  );
}

export function Status() {
  const [checks, setChecks] = useState<Checks | null>(null);
  const [running, setRunning] = useState(false);
  const [sending, setSending] = useState(false);
  const status = useCloud();
  const state = useAppState();
  const now = useNow(30_000);
  const monitoring = monitoringStatus();

  const run = useCallback(async () => {
    setRunning(true);
    const [site, database, github] = await Promise.all([
      checkSite(),
      cloudConfigured ? cloud.ping() : Promise.resolve(null),
      fetchGitHubStatus(),
    ]);
    setChecks({ site, database, github, at: new Date() });
    setRunning(false);
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const uptime = checks?.github.uptime ?? [];
  const upCount = uptime.filter((r) => r.up).length;
  const lastCheck = uptime[uptime.length - 1] ?? null;
  const openIncidents = checks?.github.incidents.filter((i) => i.open) ?? [];
  const pending = pendingCount(state);

  // Only services that are switched on can count against the headline.
  const problems = checks
    ? [
        !checks.site.ok && 'the site',
        checks.database && !checks.database.ok && 'the database',
        status.phase === 'error' && 'sync',
        lastCheck && !lastCheck.up && 'the uptime monitor',
        openIncidents.length > 0 && 'an open incident',
      ].filter((x): x is string => Boolean(x))
    : [];
  const headline: { tone: Tone; title: string; detail: string } = !checks
    ? { tone: 'neutral', title: 'Checking…', detail: 'Running live checks from your browser.' }
    : problems.length > 0
      ? { tone: 'bad', title: 'Something needs attention', detail: `Affected: ${problems.join(', ')}.` }
      : {
          tone: 'good',
          title: 'All systems operational',
          detail: `Checked ${relativeTime(checks.at, now)} from this browser.`,
        };

  async function testError() {
    setSending(true);
    const id = await sendTestError();
    setSending(false);
    toast(id ? `Test error sent to Sentry (event ${id.slice(0, 8)}).` : 'Sentry did not accept the event.', id ? 'plain' : 'bad');
  }

  return (
    <>
      <header className="page-head">
        <div className="stack" style={{ gap: 4 }}>
          <p className="eyebrow">Live checks and monitoring history</p>
          <h1 className="page-title">Status</h1>
        </div>
        <button type="button" className="btn" onClick={() => void run()} disabled={running}>
          <Icon name="sync" size={16} className={running ? 'spin' : undefined} />
          Run checks again
        </button>
      </header>

      <div className="status-banner" data-tone={headline.tone} role="status" data-testid="status-headline">
        <Icon name={headline.tone === 'bad' ? 'alert' : headline.tone === 'good' ? 'check' : 'sync'} size={28} className={!checks ? 'spin' : undefined} />
        <div>
          <strong>{headline.title}</strong>
          <p>{headline.detail}</p>
        </div>
      </div>

      <section className="card" aria-label="Services">
        <div className="service" data-testid="service-site">
          <h3>Website</h3>
          {!checks ? <Pill tone="neutral">Checking</Pill> : checks.site.ok ? <Pill tone="good">Operational</Pill> : <Pill tone="bad">Unreachable</Pill>}
          <div className="service-detail">
            <span>
              {checks?.site.ok ? `health.json answered in ${checks.site.ms} ms. ` : ''}
              Hosted on GitHub Pages, deployed by GitHub Actions.
            </span>
            <dl className="kv">
              <dt>Release</dt>
              <dd className="mono">{config.release}</dd>
              <dt>Commit</dt>
              <dd className="mono">
                {repoUrl && config.commit !== 'development' ? (
                  <ExternalLink href={`${repoUrl}/commit/${config.commit}`}>{config.commit.slice(0, 7)}</ExternalLink>
                ) : config.commit === 'development' ? (
                  'local build'
                ) : (
                  config.commit.slice(0, 7)
                )}
              </dd>
              <dt>Built</dt>
              <dd>{fmt.dayMonthYear(new Date(config.builtAt))}, {fmt.time(new Date(config.builtAt))}</dd>
            </dl>
            {checks?.site.commit && checks.site.commit !== config.commit && (
              <p className="notice">A newer version has been deployed. Reload to get it.</p>
            )}
          </div>
        </div>

        <div className="service" data-testid="service-database">
          <h3>Database and sign-in · Supabase</h3>
          {!cloudConfigured ? (
            <Pill tone="neutral">Not connected</Pill>
          ) : !checks?.database ? (
            <Pill tone="neutral">Checking</Pill>
          ) : checks.database.ok ? (
            <Pill tone="good">Operational</Pill>
          ) : (
            <Pill tone="bad">Unreachable</Pill>
          )}
          <div className="service-detail">
            {!cloudConfigured ? (
              <span>No Supabase project is configured for this deployment, so data stays on each device.</span>
            ) : (
              <>
                <span>
                  {checks?.database ? `${checks.database.detail} in ${checks.database.ms} ms. ` : ''}
                  Postgres with row-level security: each account can only read and write its own rows.
                </span>
                <dl className="kv">
                  <dt>Project</dt>
                  <dd className="mono">{new URL(config.supabaseUrl).host}</dd>
                  <dt>Session</dt>
                  <dd>{status.userId ? `Signed in${status.email ? ` as ${status.email}` : ''}` : 'Signed out'}</dd>
                  <dt>Last sync</dt>
                  <dd>
                    {state.sync.lastSyncedAt ? relativeTime(new Date(state.sync.lastSyncedAt), now) : 'Never'}
                    {pending > 0 ? ` · ${pending} waiting to upload` : ''}
                  </dd>
                </dl>
                {status.phase === 'error' && status.error && <p className="notice notice-bad">{status.error}</p>}
              </>
            )}
          </div>
        </div>

        <div className="service" data-testid="service-errors">
          <h3>Error tracking · Sentry</h3>
          {!monitoringConfigured ? <Pill tone="neutral">Not connected</Pill> : monitoring.active ? <Pill tone="good">Reporting</Pill> : <Pill tone="neutral">Starting</Pill>}
          <div className="service-detail">
            {!monitoringConfigured ? (
              <span>No Sentry DSN is configured, so errors are only written to the browser console.</span>
            ) : (
              <>
                <span>Unhandled errors and failed syncs are reported with the release and commit that produced them. No training data is attached.</span>
                <dl className="kv">
                  <dt>Environment</dt>
                  <dd>{monitoring.environment}</dd>
                  <dt>Release</dt>
                  <dd className="mono">{monitoring.release}</dd>
                </dl>
                <div>
                  <button type="button" className="btn btn-sm" onClick={() => void testError()} disabled={sending}>
                    {sending ? 'Sending…' : 'Send a test error'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="service" data-testid="service-uptime">
          <h3>Uptime monitor · GitHub Actions</h3>
          {!checks ? (
            <Pill tone="neutral">Checking</Pill>
          ) : !checks.github.available || !lastCheck ? (
            <Pill tone="neutral">No data yet</Pill>
          ) : lastCheck.up ? (
            <Pill tone="good">Up</Pill>
          ) : (
            <Pill tone="bad">Down</Pill>
          )}
          <div className="service-detail">
            {checks && !checks.github.available && <span>{checks.github.reason}</span>}
            {checks?.github.available && uptime.length === 0 && (
              <span>A scheduled workflow checks the live site every 15 minutes. Results appear here after the first deploy.</span>
            )}
            {uptime.length > 0 && lastCheck && (
              <>
                <span>
                  {upCount} of the last {uptime.length} checks passed ({((upCount / uptime.length) * 100).toFixed(upCount === uptime.length ? 0 : 1)}%). Last
                  check {relativeTime(new Date(lastCheck.at), now)}.
                </span>
                <div className="uptime-strip" role="img" aria-label={`${upCount} of ${uptime.length} recent checks passed`}>
                  {uptime.map((run) => (
                    <i key={run.url} data-state={run.up ? 'up' : 'down'} title={`${fmt.dayMonth(new Date(run.at))} ${fmt.time(new Date(run.at))}: ${run.up ? 'up' : 'down'}`} />
                  ))}
                </div>
                <span className="small faint">Oldest on the left. Full bars passed; short red bars failed.</span>
              </>
            )}
            {repoUrl && <ExternalLink href={`${repoUrl}/actions/workflows/uptime.yml`}>Check history on GitHub</ExternalLink>}
          </div>
        </div>

        <div className="service" data-testid="service-pipeline">
          <h3>Build and deploy · GitHub Actions</h3>
          {!checks ? (
            <Pill tone="neutral">Checking</Pill>
          ) : !checks.github.pipeline ? (
            <Pill tone="neutral">No data yet</Pill>
          ) : checks.github.pipeline.status !== 'completed' ? (
            <Pill tone="neutral">Running</Pill>
          ) : checks.github.pipeline.conclusion === 'success' ? (
            <Pill tone="good">Passing</Pill>
          ) : (
            <Pill tone="bad">Failing</Pill>
          )}
          <div className="service-detail">
            <span>Every push is linted, type-checked, unit-tested, tested against a real database and driven in a browser before it can deploy.</span>
            {checks?.github.pipeline && (
              <ExternalLink href={checks.github.pipeline.url}>
                Latest run, {relativeTime(new Date(checks.github.pipeline.at), now)} ({checks.github.pipeline.commit.slice(0, 7)})
              </ExternalLink>
            )}
          </div>
        </div>
      </section>

      {checks?.github.available && (
        <section className="card" aria-labelledby="incidents-title">
          <div className="card-head">
            <h2 className="section-title" id="incidents-title">
              Incidents
            </h2>
            <span className="small faint">Opened and closed automatically by the monitor</span>
          </div>
          {checks.github.incidents.length === 0 ? (
            <p className="muted small">No incidents recorded.</p>
          ) : (
            <ul className="list">
              {checks.github.incidents.map((incident) => (
                <li key={incident.number}>
                  <span className="list-main">
                    <ExternalLink href={incident.url}>{incident.title}</ExternalLink>
                    <span className="small faint">
                      Opened {fmt.dayMonth(new Date(incident.openedAt))}, {fmt.time(new Date(incident.openedAt))}
                      {incident.closedAt ? ` · resolved ${fmt.dayMonth(new Date(incident.closedAt))}, ${fmt.time(new Date(incident.closedAt))}` : ''}
                    </span>
                  </span>
                  {incident.open ? <Pill tone="bad">Ongoing</Pill> : <Pill tone="good">Resolved</Pill>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
