import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { cloud, store, useAppState, useCloud } from '../app';
import { ConfirmButton, Pill, Segmented, Stepper } from '../components/common';
import { Icon } from '../components/Icon';
import { cloudConfigured, config } from '../config';
import { relativeTime } from '../lib/dates';
import { pendingCount } from '../lib/sync';
import type { ThemePref, Units } from '../lib/types';
import { toast, useNow } from '../lib/ui';
import { loadSampleData } from './Today';

export function Account() {
  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Account</h1>
      </header>
      <div className="grid-2">
        <SyncCard />
        <Preferences />
      </div>
      <DataCard />
      <p className="small faint">
        Cadence {config.version} · <a href="#status">System status</a>
      </p>
    </>
  );
}

function SyncCard() {
  const status = useCloud();
  const state = useAppState();
  const now = useNow(20_000);
  const pending = pendingCount(state);
  const lastSynced = state.sync.lastSyncedAt;

  return (
    <section className="card" aria-labelledby="sync-title">
      <div className="card-head">
        <h2 className="section-title" id="sync-title">
          Sync
        </h2>
        {status.userId &&
          (status.phase === 'error' ? (
            <Pill tone="bad">Sync problem</Pill>
          ) : status.phase === 'offline' ? (
            <Pill tone="warn">Offline</Pill>
          ) : status.phase === 'syncing' ? (
            <Pill tone="neutral">Syncing…</Pill>
          ) : pending > 0 ? (
            <Pill tone="neutral">{pending} to upload</Pill>
          ) : (
            <Pill tone="good">Up to date</Pill>
          ))}
      </div>

      {!cloudConfigured && (
        <>
          <p className="muted">
            Your training is saved on this device and works offline. This deployment has no sync service connected, so
            nothing leaves the browser.
          </p>
          <p className="small faint">
            To sync between devices, connect a Supabase project. The steps are in the project README
            {config.githubRepo && (
              <>
                {' '}
                on{' '}
                <a href={`https://github.com/${config.githubRepo}#connect-supabase`} target="_blank" rel="noreferrer">
                  GitHub
                </a>
              </>
            )}
            .
          </p>
        </>
      )}

      {cloudConfigured && status.phase === 'starting' && <p className="muted">Connecting…</p>}

      {cloudConfigured && status.phase !== 'starting' && !status.userId && (
        <>
          <p className="muted">
            Sign in to back up your training and use it on every device. What you have logged here is uploaded to your
            account the first time you sign in.
          </p>
          {status.error && <p className="notice notice-bad">{status.error}</p>}
          <AuthForm />
        </>
      )}

      {status.userId && (
        <>
          <dl className="kv">
            <dt>Signed in as</dt>
            <dd data-testid="signed-in-email">{status.email ?? 'your account'}</dd>
            <dt>Last synced</dt>
            <dd data-testid="last-synced">{lastSynced ? relativeTime(new Date(lastSynced), now) : 'Not yet'}</dd>
            <dt>Waiting to upload</dt>
            <dd>{pending === 0 ? 'Nothing' : `${pending} ${pending === 1 ? 'change' : 'changes'}`}</dd>
          </dl>
          {status.phase === 'error' && status.error && (
            <p className="notice notice-bad">{status.error} Your changes are safe on this device and will be retried.</p>
          )}
          {status.phase === 'offline' && <p className="notice">You are offline. Changes upload when the connection returns.</p>}
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => cloud.requestSync()} disabled={status.phase === 'syncing'}>
              <Icon name="sync" size={16} className={status.phase === 'syncing' ? 'spin' : undefined} />
              Sync now
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                void cloud.signOut().then(() => toast('Signed out. Your data stays on this device.'));
              }}
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function AuthForm() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setMessage(null);
    try {
      const text = await action();
      if (text) setMessage({ tone: 'good', text });
    } catch (error) {
      setMessage({ tone: 'bad', text: error instanceof Error ? error.message : 'Something went wrong. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      if (mode === 'in') {
        await cloud.signIn(email.trim(), password);
        return null;
      }
      const needsConfirmation = await cloud.signUp(email.trim(), password);
      return needsConfirmation ? `Almost there. Open the confirmation link we sent to ${email.trim()}, then sign in.` : null;
    });
  }

  return (
    <form className="stack" onSubmit={submit}>
      <Segmented
        label="Sign in or create an account"
        value={mode}
        options={[
          { value: 'in', label: 'Sign in' },
          { value: 'up', label: 'Create account' },
        ]}
        onChange={(next) => {
          setMode(next);
          setMessage(null);
        }}
      />
      <div className="field">
        <label htmlFor="auth-email">Email</label>
        <input id="auth-email" className="input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="auth-password">Password</label>
        <input
          id="auth-password"
          className="input"
          type="password"
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          required
          minLength={mode === 'up' ? 8 : undefined}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {mode === 'up' && <span className="small faint">At least 8 characters.</span>}
      </div>
      {message && (
        <p className={`notice notice-${message.tone}`} role={message.tone === 'bad' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {mode === 'in' ? 'Sign in' : 'Create account'}
        </button>
        <button
          type="button"
          className="btn btn-quiet"
          disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())}
          onClick={() =>
            void run(async () => {
              await cloud.sendMagicLink(email.trim());
              return `Sign-in link sent to ${email.trim()}. Open it on this device.`;
            })
          }
        >
          Email me a sign-in link
        </button>
      </div>
    </form>
  );
}

function Preferences() {
  const { settings } = useAppState();
  return (
    <section className="card" aria-labelledby="prefs-title">
      <h2 className="section-title" id="prefs-title">
        Preferences
      </h2>
      <div className="row spread">
        <span className="label">Units</span>
        <Segmented<Units>
          label="Units"
          value={settings.units}
          options={[
            { value: 'kg', label: 'kg' },
            { value: 'lb', label: 'lb' },
          ]}
          onChange={(units) => store.updateSettings({ units })}
        />
      </div>
      <div className="row spread">
        <span className="label">Sessions per week</span>
        <Stepper label="sessions per week" value={settings.weeklyGoal} min={1} max={14} onChange={(weeklyGoal) => store.updateSettings({ weeklyGoal })} />
      </div>
      <div className="row spread">
        <span className="label">Rest timer</span>
        <Stepper
          label="rest timer"
          value={settings.restSeconds}
          min={0}
          max={600}
          step={15}
          format={(seconds) => (seconds === 0 ? 'Off' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`)}
          onChange={(restSeconds) => store.updateSettings({ restSeconds })}
        />
      </div>
      <div className="row spread">
        <span className="label">Appearance</span>
        <Segmented<ThemePref>
          label="Appearance"
          value={settings.theme}
          options={[
            { value: 'system', label: 'Auto' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          onChange={(theme) => store.updateSettings({ theme })}
        />
      </div>
      {cloudConfigured && (
        <p className="small faint">Units, goal and rest timer follow your account. Appearance stays on this device.</p>
      )}
    </section>
  );
}

function DataCard() {
  const state = useAppState();
  const fileInput = useRef<HTMLInputElement>(null);
  const hasSample = state.sampleIds.length > 0;

  function exportFile() {
    const json = JSON.stringify(store.exportData(), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `cadence-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyExport() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(store.exportData()));
      toast('Export copied to the clipboard.');
    } catch {
      toast('Copying is blocked here. Use “Download export” instead.', 'bad');
    }
  }

  async function importFile(file: File) {
    try {
      const counts = store.importData(await file.text());
      toast(`Imported ${counts.workouts} sessions and ${counts.body} body weight readings.`);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'That file could not be imported.', 'bad');
    }
  }

  return (
    <section className="card" aria-labelledby="data-title">
      <div className="card-head">
        <h2 className="section-title" id="data-title">
          Your data
        </h2>
        <span className="small faint">
          {Object.values(state.workouts).filter((w) => !w.deletedAt).length} sessions ·{' '}
          {Object.values(state.body).filter((b) => !b.deletedAt).length} body weight readings
        </span>
      </div>
      <div className="row">
        <button type="button" className="btn" onClick={exportFile}>
          Download export
        </button>
        <button type="button" className="btn" onClick={() => void copyExport()}>
          Copy export
        </button>
        <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
          Import a file
        </button>
        <input
          ref={fileInput}
          id="import-file"
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
            event.target.value = '';
          }}
        />
      </div>
      <hr className="divider" />
      <div className="row spread">
        <div className="stack" style={{ gap: 2, flex: '1 1 220px' }}>
          <strong>Sample data</strong>
          <span className="small muted">Ten weeks of example training to explore the charts with.</span>
        </div>
        {hasSample ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              store.clearSample();
              toast('Sample data removed.');
            }}
          >
            Remove sample data
          </button>
        ) : (
          <button type="button" className="btn" onClick={loadSampleData}>
            Load sample data
          </button>
        )}
      </div>
      <hr className="divider" />
      <div className="row spread">
        <div className="stack" style={{ gap: 2, flex: '1 1 220px' }}>
          <strong>Erase this device</strong>
          <span className="small muted">
            Removes everything stored in this browser. Anything already synced stays in your account.
          </span>
        </div>
        <ConfirmButton
          label="Erase device data"
          confirmLabel="Erase everything here"
          className="btn btn-danger"
          onConfirm={() => {
            store.resetAll();
            toast('This device was erased.');
          }}
        />
      </div>
    </section>
  );
}
