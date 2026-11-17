import type { ReactNode } from 'react';
import { useAppState, useCloud } from '../app';
import { pendingCount } from '../lib/sync';
import type { Route } from '../lib/ui';
import { BrandMark, Icon } from './Icon';
import type { IconName } from './Icon';

const NAV: Array<{ route: Route; label: string; icon: IconName; rail?: boolean }> = [
  { route: 'today', label: 'Today', icon: 'today' },
  { route: 'history', label: 'History', icon: 'history' },
  { route: 'progress', label: 'Progress', icon: 'progress' },
  { route: 'tools', label: 'Tools', icon: 'tools' },
  { route: 'account', label: 'Account', icon: 'account' },
  { route: 'status', label: 'Status', icon: 'status', rail: true },
];

function SyncChip() {
  const cloud = useCloud();
  const pending = pendingCount(useAppState());
  let icon: IconName = 'device';
  let label = 'On this device';
  let tone = 'neutral';
  let spin = false;

  switch (cloud.phase) {
    case 'starting':
      [icon, label, spin] = ['sync', 'Connecting…', true];
      break;
    case 'signed-out':
      [icon, label] = ['cloud', 'Sign in to sync'];
      break;
    case 'syncing':
      [icon, label, spin] = ['sync', 'Syncing…', true];
      break;
    case 'idle':
      if (pending > 0) [icon, label] = ['cloud', `${pending} to upload`];
      else [icon, label, tone] = ['check', 'Synced', 'good'];
      break;
    case 'offline':
      [icon, label, tone] = ['alert', pending > 0 ? `Offline · ${pending} waiting` : 'Offline', 'warn'];
      break;
    case 'error':
      [icon, label, tone] = ['alert', 'Sync problem', 'bad'];
      break;
  }

  return (
    <a className="sync-chip" href="#account" data-tone={tone} data-testid="sync-chip">
      <Icon name={icon} size={16} className={spin ? 'spin' : undefined} />
      {label}
    </a>
  );
}

export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  // The logger is reached from Today, so it lights up the Today tab.
  const current = route === 'workout' ? 'today' : route;
  return (
    <div className="shell">
      <aside className="rail">
        <a className="brand" href="#today">
          <BrandMark />
          Cadence
        </a>
        <nav className="rail-nav" aria-label="Main">
          {NAV.map((item) => (
            <a key={item.route} className="rail-link" href={`#${item.route}`} aria-current={current === item.route ? 'page' : undefined}>
              <Icon name={item.icon} />
              {item.label}
            </a>
          ))}
        </nav>
        <div className="rail-foot">
          <SyncChip />
        </div>
      </aside>
      <div>
        <header className="topbar">
          <a className="brand" href="#today">
            <BrandMark />
            Cadence
          </a>
          <SyncChip />
        </header>
        <main className="main" id="main">
          {children}
        </main>
      </div>
      <nav className="tabbar" aria-label="Main">
        {NAV.filter((item) => !item.rail).map((item) => (
          <a key={item.route} className="tab" href={`#${item.route}`} aria-current={current === item.route ? 'page' : undefined}>
            <span className="tab-icon">
              <Icon name={item.icon} />
            </span>
            {item.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
