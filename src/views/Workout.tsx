import { useMemo, useState } from 'react';
import { formatSet, store, useAppState, useWorkouts } from '../app';
import { ConfirmButton, NumberField, Sheet } from '../components/common';
import { Icon } from '../components/Icon';
import { StartPanel } from '../components/StartPanel';
import { lastPerformance, workoutSetCount, workoutVolume } from '../lib/analytics';
import { formatClock } from '../lib/dates';
import { customExerciseId, findExercise, MUSCLE_LABEL, MUSCLES, searchExercises } from '../lib/exercises';
import type { ExerciseDef, MuscleGroup, Units, Workout, WorkoutExercise } from '../lib/types';
import { formatCompact, fromDisplay, toDisplay } from '../lib/units';
import { navigate, showSummary, toast, useNow } from '../lib/ui';

export function WorkoutView() {
  const state = useAppState();
  const { completed, active } = useWorkouts();
  const [picking, setPicking] = useState(false);
  const [rest, setRest] = useState<{ endsAt: number; total: number } | null>(null);
  const { units, restSeconds } = state.settings;

  // Exercises the user invented earlier stay available in the picker.
  const custom = useMemo(() => {
    const seen = new Map<string, ExerciseDef>();
    for (const w of completed) {
      for (const e of w.exercises) {
        if (e.exerciseId.startsWith('custom-')) {
          seen.set(e.exerciseId, { id: e.exerciseId, name: e.name, muscle: e.muscle, equipment: 'barbell' });
        }
      }
    }
    return [...seen.values()];
  }, [completed]);

  if (!active) {
    return (
      <>
        <header className="page-head">
          <h1 className="page-title">Workout</h1>
        </header>
        <p className="muted">No session in progress. Pick a routine to begin.</p>
        <StartPanel />
      </>
    );
  }

  const workout = active;

  function finish() {
    const finished = store.finishWorkout(workout.id);
    setRest(null);
    if (finished) {
      showSummary(finished.id);
    } else {
      toast('No sets were ticked off, so nothing was saved.');
    }
    navigate('today');
  }

  return (
    <>
      <header className="workout-head">
        <input
          id="workout-name"
          className="workout-name"
          aria-label="Session name"
          value={workout.name}
          maxLength={120}
          onChange={(event) => store.renameWorkout(workout.id, event.target.value)}
        />
        <Elapsed startedAt={workout.startedAt} />
      </header>

      <p className="small muted" aria-live="polite">
        {workoutSetCount(workout)} sets done · {formatCompact(toDisplay(workoutVolume(workout), units))} {units} lifted
      </p>

      {workout.exercises.length === 0 && (
        <div className="empty">
          <p className="muted">Add your first exercise to start logging sets.</p>
        </div>
      )}

      {workout.exercises.map((exercise) => (
        <ExerciseCard
          key={exercise.id}
          workout={workout}
          exercise={exercise}
          units={units}
          previous={lastPerformance(completed, exercise.exerciseId)
            .map((s) => formatSet(s, units))
            .join(' · ')}
          onSetDone={() => restSeconds > 0 && setRest({ endsAt: Date.now() + restSeconds * 1000, total: restSeconds * 1000 })}
        />
      ))}

      <button type="button" className="btn" onClick={() => setPicking(true)}>
        <Icon name="plus" size={18} />
        Add exercise
      </button>

      <div className="field">
        <label htmlFor="workout-notes">Notes</label>
        <textarea
          id="workout-notes"
          className="textarea"
          placeholder="How did it feel? Anything to remember next time?"
          value={workout.notes}
          maxLength={4000}
          onChange={(event) => store.setNotes(workout.id, event.target.value)}
        />
      </div>

      <div className="row spread">
        <ConfirmButton
          label="Discard session"
          confirmLabel="Discard it"
          className="btn btn-quiet btn-danger"
          onConfirm={() => {
            store.deleteWorkout(workout.id);
            setRest(null);
            navigate('today');
          }}
        />
        <button type="button" className="btn btn-primary btn-lg" onClick={finish}>
          <Icon name="check" size={18} />
          Finish session
        </button>
      </div>

      {rest && <div className="rest-spacer" aria-hidden="true" />}
      {rest && (
        <RestTimer
          endsAt={rest.endsAt}
          total={rest.total}
          onAdd={() => setRest({ endsAt: rest.endsAt + 30_000, total: rest.total + 30_000 })}
          onDone={() => setRest(null)}
        />
      )}

      <ExercisePicker
        open={picking}
        extra={custom}
        onClose={() => setPicking(false)}
        onPick={(def) => {
          store.addExercise(workout.id, def);
          setPicking(false);
        }}
      />
    </>
  );
}

function Elapsed({ startedAt }: { startedAt: string }) {
  const now = useNow(1000);
  return (
    <span className="clock" role="timer" aria-label="Elapsed time">
      {formatClock(now.getTime() - Date.parse(startedAt))}
    </span>
  );
}

function ExerciseCard({
  workout,
  exercise,
  units,
  previous,
  onSetDone,
}: {
  workout: Workout;
  exercise: WorkoutExercise;
  units: Units;
  previous: string;
  onSetDone: () => void;
}) {
  const bodyweight = findExercise(exercise.exerciseId)?.equipment === 'bodyweight';
  return (
    <section className="card exercise" aria-label={exercise.name}>
      <div className="exercise-head">
        <div className="stack" style={{ gap: 2 }}>
          <h2 className="exercise-name">{exercise.name}</h2>
          <span className="small faint">
            {MUSCLE_LABEL[exercise.muscle]}
            {previous && ` · Last time: ${previous}`}
          </span>
        </div>
        <ConfirmButton
          label={
            <>
              <Icon name="trash" size={16} />
              <span className="visually-hidden">Remove {exercise.name}</span>
            </>
          }
          confirmLabel="Remove"
          className="icon-btn"
          onConfirm={() => store.removeExercise(workout.id, exercise.id)}
        />
      </div>

      <div className="sets" role="group" aria-label={`${exercise.name} sets`}>
        <span className="sets-label" style={{ textAlign: 'center' }}>
          Set
        </span>
        <span className="sets-label">Weight ({units})</span>
        <span className="sets-label">Reps</span>
        <span className="sets-label" style={{ textAlign: 'center' }}>
          Done
        </span>
        <span />
        {exercise.sets.map((set, index) => (
          <div key={set.id} className={set.done ? 'set-row-done' : undefined} style={{ display: 'contents' }}>
            <span className="set-index">{index + 1}</span>
            <NumberField
              className="set-input"
              ariaLabel={`Set ${index + 1} weight in ${units}`}
              placeholder={bodyweight ? 'BW' : '0'}
              max={2000}
              value={Math.round(toDisplay(set.weightKg, units) * 100) / 100}
              onCommit={(value) =>
                store.updateSet(workout.id, exercise.id, set.id, { weightKg: fromDisplay(value ?? 0, units) })
              }
            />
            <NumberField
              className="set-input"
              ariaLabel={`Set ${index + 1} reps`}
              max={1000}
              decimals={0}
              value={set.reps}
              onCommit={(value) => store.updateSet(workout.id, exercise.id, set.id, { reps: Math.round(value ?? 0) })}
            />
            <button
              type="button"
              className="set-check"
              role="checkbox"
              aria-checked={set.done}
              aria-label={`Set ${index + 1} done`}
              disabled={set.reps <= 0}
              title={set.reps <= 0 ? 'Enter reps first' : undefined}
              onClick={() => {
                store.updateSet(workout.id, exercise.id, set.id, { done: !set.done });
                if (!set.done) onSetDone();
              }}
            >
              <Icon name="check" size={22} />
            </button>
            <button
              type="button"
              className="icon-btn"
              style={{ width: 36 }}
              aria-label={`Delete set ${index + 1}`}
              onClick={() => store.removeSet(workout.id, exercise.id, set.id)}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="btn btn-sm btn-quiet" style={{ alignSelf: 'flex-start' }} onClick={() => store.addSet(workout.id, exercise.id)}>
        <Icon name="plus" size={16} />
        Add set
      </button>
    </section>
  );
}

function RestTimer({ endsAt, total, onAdd, onDone }: { endsAt: number; total: number; onAdd: () => void; onDone: () => void }) {
  const now = useNow(250).getTime();
  const left = endsAt - now;
  const over = left <= 0;
  // Clears itself a few seconds after reaching zero.
  if (left < -4000) queueMicrotask(onDone);
  return (
    <div className="rest" role="timer" aria-label="Rest timer">
      <span className="rest-time">{over ? '0:00' : formatClock(left + 999)}</span>
      <span className="rest-label">{over ? 'Rest over. Next set.' : 'Rest'}</span>
      {!over && (
        <button type="button" className="btn" onClick={onAdd}>
          +30 s
        </button>
      )}
      <button type="button" className="btn" onClick={onDone}>
        {over ? 'Dismiss' : 'Skip'}
      </button>
      <span className="rest-bar" style={{ width: `${Math.max(0, Math.min(100, (left / total) * 100))}%` }} />
    </div>
  );
}

function ExercisePicker({
  open,
  extra,
  onClose,
  onPick,
}: {
  open: boolean;
  extra: ExerciseDef[];
  onClose: () => void;
  onPick: (def: ExerciseDef) => void;
}) {
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all');
  const [customMuscle, setCustomMuscle] = useState<MuscleGroup>('chest');
  const results = searchExercises(query, muscle, extra);
  const name = query.trim();
  const exact = results.some((e) => e.name.toLowerCase() === name.toLowerCase());

  function pick(def: ExerciseDef) {
    setQuery('');
    setMuscle('all');
    onPick(def);
  }

  return (
    <Sheet open={open} title="Add exercise" onClose={onClose}>
      <div className="field">
        <label htmlFor="exercise-search">Search</label>
        <input
          id="exercise-search"
          className="input"
          type="search"
          placeholder="Bench press, squat, row…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="chips" role="group" aria-label="Muscle group">
        <button type="button" className="chip" aria-pressed={muscle === 'all'} onClick={() => setMuscle('all')}>
          All
        </button>
        {MUSCLES.map((m) => (
          <button key={m} type="button" className="chip" aria-pressed={muscle === m} onClick={() => setMuscle(m)}>
            {MUSCLE_LABEL[m]}
          </button>
        ))}
      </div>
      <div className="picker-list">
        {results.map((def) => (
          <button key={def.id} type="button" className="picker-item" onClick={() => pick(def)}>
            <span>{def.name}</span>
            <span>{MUSCLE_LABEL[def.muscle]}</span>
          </button>
        ))}
        {results.length === 0 && name === '' && <p className="muted small">No exercises in this group.</p>}
      </div>
      {name !== '' && !exact && (
        <div className="stack">
          <hr className="divider" />
          <p className="small muted">Not in the list? Add “{name}” as your own exercise.</p>
          <div className="row">
            <label className="visually-hidden" htmlFor="custom-muscle">
              Muscle group
            </label>
            <select
              id="custom-muscle"
              className="select"
              style={{ width: 'auto', flex: '1 1 140px' }}
              value={muscle === 'all' ? customMuscle : muscle}
              onChange={(event) => setCustomMuscle(event.target.value as MuscleGroup)}
              disabled={muscle !== 'all'}
            >
              {MUSCLES.map((m) => (
                <option key={m} value={m}>
                  {MUSCLE_LABEL[m]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                pick({
                  id: customExerciseId(name),
                  name: name.slice(0, 80),
                  muscle: muscle === 'all' ? customMuscle : muscle,
                  equipment: 'barbell',
                })
              }
            >
              Add “{name.length > 24 ? `${name.slice(0, 24)}…` : name}”
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
