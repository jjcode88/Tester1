import { formatSet, store, useAppState, useWorkouts } from '../app';
import { ConfirmButton } from '../components/common';
import { Icon } from '../components/Icon';
import { workoutSetCount, workoutVolume } from '../lib/analytics';
import { fmt, formatDuration } from '../lib/dates';
import type { Workout } from '../lib/types';
import { formatCompact, toDisplay } from '../lib/units';
import { navigate, toast } from '../lib/ui';

const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });

export function History() {
  const { units } = useAppState().settings;
  const { completed, active } = useWorkouts();
  const newestFirst = [...completed].reverse();

  const months: Array<{ label: string; workouts: Workout[] }> = [];
  for (const w of newestFirst) {
    const label = fmt.monthYear(new Date(w.startedAt));
    const group = months[months.length - 1];
    if (group && group.label === label) group.workouts.push(w);
    else months.push({ label, workouts: [w] });
  }

  function repeat(workout: Workout) {
    if (active) {
      toast('Finish the session in progress before starting another.');
      navigate('workout');
      return;
    }
    store.startWorkout({ kind: 'repeat', workout });
    navigate('workout');
  }

  return (
    <>
      <header className="page-head">
        <div className="stack" style={{ gap: 4 }}>
          <p className="eyebrow">
            {completed.length} {completed.length === 1 ? 'session' : 'sessions'} logged
          </p>
          <h1 className="page-title">History</h1>
        </div>
      </header>

      {completed.length === 0 && (
        <div className="empty">
          <p className="muted">Finished sessions are listed here, newest first.</p>
          <a className="btn btn-primary" href="#today">
            Start a session
          </a>
        </div>
      )}

      {months.map((month) => (
        <section className="stack" key={month.label} aria-label={month.label}>
          <h2 className="section-title">{month.label}</h2>
          {month.workouts.map((w) => {
            const start = new Date(w.startedAt);
            return (
              <details className="session" key={w.id}>
                <summary>
                  <span className="date-badge" aria-hidden="true">
                    <b>{start.getDate()}</b>
                    <span>{weekday.format(start)}</span>
                  </span>
                  <span className="list-main">
                    <strong>{w.name}</strong>
                    <span className="small faint num">
                      <span className="visually-hidden">{fmt.weekdayLong(start)}, </span>
                      {formatDuration(Date.parse(w.endedAt!) - start.getTime())} · {workoutSetCount(w)} sets ·{' '}
                      {formatCompact(toDisplay(workoutVolume(w), units))} {units}
                    </span>
                  </span>
                  <Icon name="chevron" className="chev" />
                </summary>
                <div className="session-body">
                  {w.exercises.map((exercise) => (
                    <div className="session-exercise" key={exercise.id}>
                      <strong>{exercise.name}</strong>
                      <span className="session-sets">
                        {exercise.sets
                          .filter((s) => s.done)
                          .map((s) => formatSet(s, units))
                          .join(' · ')}
                      </span>
                    </div>
                  ))}
                  {w.notes && <p className="notice">{w.notes}</p>}
                  <div className="row spread">
                    <button type="button" className="btn btn-sm" onClick={() => repeat(w)}>
                      <Icon name="repeat" size={16} />
                      Repeat this session
                    </button>
                    <ConfirmButton
                      label={
                        <>
                          <Icon name="trash" size={16} />
                          Delete
                        </>
                      }
                      confirmLabel="Delete session"
                      onConfirm={() => {
                        store.deleteWorkout(w.id);
                        toast('Session deleted.');
                      }}
                    />
                  </div>
                </div>
              </details>
            );
          })}
        </section>
      ))}
    </>
  );
}
