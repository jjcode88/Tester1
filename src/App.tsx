import { useEffect } from 'react';
import { store, useAppState, useWorkouts } from './app';
import { Sheet } from './components/common';
import { Icon } from './components/Icon';
import { Shell } from './components/Shell';
import { recordsSetIn, workoutSetCount, workoutVolume } from './lib/analytics';
import { formatDuration } from './lib/dates';
import { formatCompact, toDisplay } from './lib/units';
import { showSummary, useRoute, useUi } from './lib/ui';
import { Account } from './views/Account';
import { History } from './views/History';
import { Progress } from './views/Progress';
import { Status } from './views/Status';
import { Today } from './views/Today';
import { Tools } from './views/Tools';
import { WorkoutView } from './views/Workout';

const VIEWS = {
  today: Today,
  workout: WorkoutView,
  history: History,
  progress: Progress,
  tools: Tools,
  account: Account,
  status: Status,
};

const TITLES = {
  today: 'Today',
  workout: 'Workout',
  history: 'History',
  progress: 'Progress',
  tools: 'Tools',
  account: 'Account',
  status: 'Status',
};

export function App() {
  const route = useRoute();
  const { theme } = useAppState().settings;
  const View = VIEWS[route];

  useEffect(() => {
    // "Auto" removes the attribute so the OS preference decides.
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.title = `${TITLES[route]} · Cadence`;
  }, [route]);

  // Don't lose the last edits if the tab is closed mid-debounce.
  useEffect(() => {
    const flush = () => store.flush();
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  return (
    <>
      <Shell route={route}>
        <View />
      </Shell>
      <SummarySheet />
      <Toasts />
    </>
  );
}

function SummarySheet() {
  const { summaryId } = useUi();
  const state = useAppState();
  const { completed } = useWorkouts();
  const workout = summaryId ? state.workouts[summaryId] : undefined;
  const { units } = state.settings;
  const records = workout ? recordsSetIn(completed, workout) : [];
  const names = new Map(workout?.exercises.map((e) => [e.exerciseId, e.name]));

  return (
    <Sheet open={Boolean(workout)} title="Session saved" onClose={() => showSummary(null)}>
      {workout && (
        <>
          <p className="muted">{workout.name} is in your history.</p>
          <div className="summary-stats">
            <div>
              <b className="num">{formatDuration(Date.parse(workout.endedAt ?? workout.startedAt) - Date.parse(workout.startedAt))}</b>
              <span>Duration</span>
            </div>
            <div>
              <b className="num">{workoutSetCount(workout)}</b>
              <span>Sets</span>
            </div>
            <div>
              <b className="num">{formatCompact(toDisplay(workoutVolume(workout), units))}</b>
              <span>Volume, {units}</span>
            </div>
          </div>
          {records.length > 0 && (
            <div className="stack" style={{ gap: 8 }}>
              <span className="label">New records</span>
              <div className="chips">
                {records.map((id) => (
                  <span className="pill pill-gold" key={id}>
                    <Icon name="medal" size={13} />
                    {names.get(id)}
                  </span>
                ))}
              </div>
            </div>
          )}
          <button type="button" className="btn btn-primary btn-block" onClick={() => showSummary(null)}>
            Done
          </button>
        </>
      )}
    </Sheet>
  );
}

function Toasts() {
  const { toasts } = useUi();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div className="toast" key={t.id} data-tone={t.tone}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
