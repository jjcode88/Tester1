import { config } from '../config';

export interface SiteHealth {
  ok: boolean;
  ms: number;
  /** Commit the live site reports, when reachable. */
  commit: string | null;
  builtAt: string | null;
}

/** Fetches the same endpoint the uptime monitor polls. */
export async function checkSite(): Promise<SiteHealth> {
  const started = performance.now();
  try {
    const response = await fetch(`./health.json?t=${Date.now()}`, { cache: 'no-store' });
    const body = (await response.json()) as { status?: string; commit?: string; builtAt?: string };
    return {
      ok: response.ok && body.status === 'ok',
      ms: Math.round(performance.now() - started),
      commit: body.commit ?? null,
      builtAt: body.builtAt ?? null,
    };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - started), commit: null, builtAt: null };
  }
}

export interface UptimeRun {
  at: string;
  up: boolean;
  url: string;
}

export interface Incident {
  number: number;
  title: string;
  open: boolean;
  openedAt: string;
  closedAt: string | null;
  url: string;
}

export interface PipelineRun {
  conclusion: string | null;
  status: string;
  at: string;
  url: string;
  commit: string;
}

export interface GitHubStatus {
  available: boolean;
  /** Why the data is missing, in words fit for the page. */
  reason: string | null;
  uptime: UptimeRun[];
  incidents: Incident[];
  pipeline: PipelineRun | null;
}

interface WorkflowRun {
  conclusion: string | null;
  status: string;
  created_at: string;
  html_url: string;
  head_sha: string;
}

async function github<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.github.com/repos/${config.githubRepo}${path}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as T;
}

/**
 * Monitoring history, straight from GitHub's public API: each run of the
 * uptime workflow is one check, and each issue labelled "incident" is one
 * outage. Nothing is stored anywhere else.
 */
export async function fetchGitHubStatus(): Promise<GitHubStatus> {
  const empty = { uptime: [], incidents: [], pipeline: null };
  if (!config.githubRepo) {
    return { available: false, reason: 'This build is not linked to a GitHub repository.', ...empty };
  }
  try {
    const [checks, issues, pipeline] = await Promise.all([
      github<{ workflow_runs: WorkflowRun[] }>('/actions/workflows/uptime.yml/runs?per_page=60&status=completed'),
      github<Array<{ number: number; title: string; state: string; created_at: string; closed_at: string | null; html_url: string; pull_request?: unknown }>>(
        '/issues?labels=incident&state=all&per_page=5',
      ),
      github<{ workflow_runs: WorkflowRun[] }>('/actions/workflows/ci.yml/runs?per_page=1'),
    ]);
    const latest = pipeline.workflow_runs[0];
    return {
      available: true,
      reason: null,
      // Cancelled runs are checks that were skipped (for example before the first deploy).
      uptime: checks.workflow_runs
        .filter((run) => run.conclusion === 'success' || run.conclusion === 'failure')
        .map((run) => ({ at: run.created_at, up: run.conclusion === 'success', url: run.html_url }))
        .reverse(),
      incidents: issues
        .filter((issue) => !issue.pull_request)
        .map((issue) => ({
          number: issue.number,
          title: issue.title,
          open: issue.state === 'open',
          openedAt: issue.created_at,
          closedAt: issue.closed_at,
          url: issue.html_url,
        })),
      pipeline: latest
        ? { conclusion: latest.conclusion, status: latest.status, at: latest.created_at, url: latest.html_url, commit: latest.head_sha }
        : null,
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const reason =
      code === '403' || code === '429'
        ? 'GitHub is rate-limiting this network. Try again in a few minutes.'
        : code === '404'
          ? 'Monitoring history is only public for public repositories.'
          : 'GitHub could not be reached from this browser.';
    return { available: false, reason, ...empty };
  }
}
