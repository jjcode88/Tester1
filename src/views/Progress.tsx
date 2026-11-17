import { useMemo, useState } from 'react';
import { store, useAppState, useWorkouts } from '../app';
import { ColumnChart, LineChart, RankedBars } from '../components/charts';
import { ConfirmButton, NumberField, Segmented } from '../components/common';
import { Icon } from '../components/Icon';
import { bodySeries, exerciseHistory, muscleSetCounts, personalRecords, trainedExercises, weeklySeries } from '../lib/analytics';
import { addDays, dayKey, daysBetween, fmt, parseDayKey, startOfWeek } from '../lib/dates';
import { MUSCLE_LABEL, MUSCLES } from '../lib/exercises';
import { formatCompact, formatNumber, formatWeight, fromDisplay, toDisplay } from '../lib/units';
import { toast } from '../lib/ui';

type Range = '4w' | '12w' | '26w' | 'all';

const RANGES: Array<{ value: Range; label: string }> = [
  { value: '4w', label: '4 weeks' },
  { value: '12w', label: '12 weeks' },
  { value: '26w', label: '6 months' },
  { value: 'all', label: 'All' },
];

export function Progress() {
  const state = useAppState();
  const { completed } = useWorkouts();
  const { units } = state.settings;
  const [range, setRange] = useState<Range>('12w');
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const today = dayKey(new Date());

  const view = useMemo(() => {
    const now = parseDayKey(today);
    const first = completed[0] ? new Date(completed[0].startedAt) : now;
    const allWeeks = Math.min(104, Math.max(4, Math.ceil(daysBetween(startOfWeek(first), now) / 7) + 1));
    const weeks = range === 'all' ? allWeeks : Number.parseInt(range, 10);
    const since = range === 'all' ? new Date(0) : addDays(startOfWeek(now), -7 * (weeks - 1));
    const inRange = completed.filter((w) => new Date(w.startedAt) >= since);
    return {
      weeks: weeklySeries(completed, weeks, now),
      since,
      inRange,
      exercises: trainedExercises(inRange),
      muscles: muscleSetCounts(inRange, since),
      records: personalRecords(inRange),
      body: bodySeries(Object.values(state.body)).filter((p) => p.date >= since),
    };
  }, [completed, state.body, range, today]);

  const selected = view.exercises.find((e) => e.exerciseId === exerciseId) ?? view.exercises[0] ?? null;
  const history = selected ? exerciseHistory(view.inRange, selected.exerciseId) : [];
  const weighted = history.some((h) => h.best.weightKg > 0);
  const rangeLabel = RANGES.find((r) => r.value === range)!.label.toLowerCase();

  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Progress</h1>
      </header>

      <div className="filters">
        <Segmented label="Time range" value={range} options={RANGES} onChange={setRange} />
        <span className="small faint">Everything below covers {range === 'all' ? 'all your history' : `the last ${rangeLabel}`}.</span>
      </div>

      {completed.length === 0 ? (
        <div className="empty">
          <p className="muted">Charts appear once you have finished a session.</p>
          <a className="btn btn-primary" href="#today">
            Start a session
          </a>
        </div>
      ) : (
        <>
          <section className="card" aria-labelledby="p-volume">
            <div className="card-head">
              <h2 className="section-title" id="p-volume">
                Weekly volume
              </h2>
              <span className="small faint">Weight × reps, {units}</span>
            </div>
            <ColumnChart
              data={view.weeks.map((week) => ({
                key: dayKey(week.weekStart),
                label: fmt.dayMonth(week.weekStart),
                title: `Week of ${fmt.dayMonth(week.weekStart)} · ${week.workouts} ${week.workouts === 1 ? 'session' : 'sessions'}`,
                value: Math.round(toDisplay(week.volumeKg, units)),
              }))}
              format={(v) => `${formatCompact(v)} ${units}`}
              formatAxis={formatCompact}
              valueHeading={`Volume (${units})`}
              categoryHeading="Week"
              ariaLabel="Lifted volume per week"
              height={220}
            />
          </section>

          <div className="grid-2">
            <section className="card" aria-labelledby="p-strength">
              <div className="card-head">
                <h2 className="section-title" id="p-strength">
                  {weighted ? 'Estimated 1RM' : 'Best set'}
                </h2>
                <span className="small faint">{weighted ? `Best set per session, ${units}` : 'Most reps per session'}</span>
              </div>
              {selected ? (
                <>
                  <div className="field">
                    <label htmlFor="progress-exercise">Exercise</label>
                    <select
                      id="progress-exercise"
                      className="select"
                      value={selected.exerciseId}
                      onChange={(event) => setExerciseId(event.target.value)}
                    >
                      {view.exercises.map((e) => (
                        <option key={e.exerciseId} value={e.exerciseId}>
                          {e.name} ({e.sessions})
                        </option>
                      ))}
                    </select>
                  </div>
                  <LineChart
                    series={[
                      {
                        key: 'e1rm',
                        name: weighted ? 'Estimated 1RM' : 'Reps',
                        color: 'var(--series-1)',
                        points: history.map((h) => ({
                          x: h.date.getTime(),
                          y: weighted ? Math.round(toDisplay(h.best.e1rmKg, units) * 10) / 10 : h.best.reps,
                        })),
                      },
                    ]}
                    formatX={(x) => fmt.dayMonth(new Date(x))}
                    formatY={(y) => formatNumber(y)}
                    ariaLabel={`${selected.name}: ${weighted ? 'estimated one-rep max' : 'best reps'} per session`}
                  />
                </>
              ) : (
                <p className="muted small">No sessions in this range.</p>
              )}
            </section>

            <section className="card" aria-labelledby="p-balance">
              <div className="card-head">
                <h2 className="section-title" id="p-balance">
                  Muscle balance
                </h2>
                <span className="small faint">Completed sets</span>
              </div>
              <RankedBars
                unit="sets"
                rows={MUSCLES.map((m) => ({ key: m, label: MUSCLE_LABEL[m], value: view.muscles[m] })).sort((a, b) => b.value - a.value)}
              />
            </section>
          </div>
        </>
      )}

      <section className="card" aria-labelledby="p-body">
        <div className="card-head">
          <h2 className="section-title" id="p-body">
            Body weight
          </h2>
          <span className="small faint">{units}</span>
        </div>
        {view.body.length > 0 ? (
          <LineChart
            series={[
              {
                key: 'average',
                name: '7-reading average',
                color: 'var(--series-1)',
                points: view.body.map((p) => ({ x: p.date.getTime(), y: Math.round(toDisplay(p.averageKg, units) * 10) / 10 })),
              },
              {
                key: 'reading',
                name: 'Daily reading',
                color: 'var(--series-muted)',
                points: view.body.map((p) => ({ x: p.date.getTime(), y: Math.round(toDisplay(p.weightKg, units) * 10) / 10 })),
              },
            ]}
            formatX={(x) => fmt.dayMonth(new Date(x))}
            formatY={(y) => formatNumber(y)}
            ariaLabel="Body weight over time"
          />
        ) : (
          <p className="muted small">No readings in this range. Log one below; a few a week is enough to see the trend.</p>
        )}
        <BodyForm />
      </section>

      {view.records.length > 0 && (
        <section className="card" aria-labelledby="p-records">
          <div className="card-head">
            <h2 className="section-title" id="p-records">
              Best lifts
            </h2>
            <span className="small faint">Top set per exercise in this range</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Exercise</th>
                  <th className="num">Best set</th>
                  <th className="num">Est. 1RM</th>
                  <th className="num">Sessions</th>
                  <th className="num">Set on</th>
                </tr>
              </thead>
              <tbody>
                {[...view.records]
                  .sort((a, b) => b.best.e1rmKg - a.best.e1rmKg || b.best.reps - a.best.reps)
                  .map((record) => (
                    <tr key={record.exerciseId}>
                      <td>{record.name}</td>
                      <td className="num">
                        {record.best.weightKg > 0
                          ? `${formatWeight(record.best.weightKg, units)} ${units} × ${record.best.reps}`
                          : `${record.best.reps} reps`}
                      </td>
                      <td className="num">{record.best.e1rmKg > 0 ? `${formatWeight(record.best.e1rmKg, units, 1)} ${units}` : '–'}</td>
                      <td className="num">{record.sessions}</td>
                      <td className="num">{fmt.dayMonth(record.date)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function BodyForm() {
  const state = useAppState();
  const { units } = state.settings;
  const [date, setDate] = useState(() => dayKey(new Date()));
  const [weight, setWeight] = useState<number | null>(null);
  const [formKey, setFormKey] = useState(0);
  const recent = Object.values(state.body)
    .filter((e) => !e.deletedAt)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const valid = weight !== null && weight > 0 && fromDisplay(weight, units) < 500 && date <= dayKey(new Date());

  return (
    <>
      <hr className="divider" />
      <form
        className="row"
        style={{ alignItems: 'flex-end' }}
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid || weight === null) return;
          store.logBody(date, fromDisplay(weight, units));
          toast(`Logged ${formatNumber(weight)} ${units}.`);
          setWeight(null);
          setFormKey((k) => k + 1);
        }}
      >
        <div className="field" style={{ flex: '1 1 140px' }}>
          <label htmlFor="body-date">Date</label>
          <input id="body-date" className="input" type="date" max={dayKey(new Date())} value={date} onChange={(event) => setDate(event.target.value)} required />
        </div>
        <div className="field" style={{ flex: '1 1 120px' }}>
          <label htmlFor="body-weight">Weight</label>
          <div className="input-suffix">
            <NumberField key={formKey} id="body-weight" value={weight} onCommit={setWeight} max={1100} placeholder="0.0" />
            <span>{units}</span>
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={!valid}>
          Log weight
        </button>
      </form>
      {recent.length > 0 && (
        <ul className="list">
          {recent.map((entry) => (
            <li key={entry.id}>
              <span className="list-main">
                <span>{fmt.weekdayShort(parseDayKey(entry.date))}</span>
              </span>
              <span className="row">
                <strong className="num">
                  {formatWeight(entry.weightKg, units)} {units}
                </strong>
                <ConfirmButton
                  label={
                    <>
                      <Icon name="trash" size={16} />
                      <span className="visually-hidden">Delete reading from {fmt.dayMonth(parseDayKey(entry.date))}</span>
                    </>
                  }
                  confirmLabel="Delete"
                  className="icon-btn"
                  onConfirm={() => store.deleteBody(entry.id)}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
