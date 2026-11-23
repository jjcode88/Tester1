import { useMemo } from 'react';
import { backUpNow, store, useAppState, useCloud, useWorkouts } from '../app';
import { backupDue } from '../lib/backup';
import { ColumnChart } from '../components/charts';
import { WeekBar } from '../components/graphics';
import { Icon } from '../components/Icon';
import { StartPanel } from '../components/StartPanel';
import { bodySeries, personalRecords, trainedDays, weeklySeries, weekStreak, workoutSetCount, workoutVolume } from '../lib/analytics';
import { addDays, dayKey, fmt, formatClock, isoWeek, relativeDay, startOfWeek } from '../lib/dates';
import { buildSampleData } from '../lib/seed';
import { formatCompact, formatWeight, toDisplay } from '../lib/units';
import { navigate, toast, useNow } from '../lib/ui';

const DAY_LETTERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function loadSampleData() {
  const sample = buildSampleData(new Date());
  store.mergeRecords(sample.workouts, sample.body, true);
  toast('Loaded ten weeks of sample training.');
}

export function Today() {
  const state = useAppState();
  const { completed, active } = useWorkouts();
  const cloud = useCloud();
  const now = useNow(30_000);
  const { units, weeklyGoal } = state.settings;

  const stats = useMemo(() => {
    const weeks = weeklySeries(completed, 8, now);
    const body = bodySeries(Object.values(state.body));
    const monthAgo = addDays(now, -30);
    const recent = completed.filter((w) => new Date(w.startedAt) >= monthAgo);
    const minutes = recent.map((w) => (Date.parse(w.endedAt!) - Date.parse(w.startedAt)) / 60_000);
    // Mid-week, a fair comparison is last week up to this same weekday and time.
    const elapsed = now.getTime() - startOfWeek(now).getTime();
    const lastWeekStart = addDays(startOfWeek(now), -7).getTime();
    const lastWeekToDateKg = completed
      .filter((w) => {
        const t = Date.parse(w.startedAt);
        return t >= lastWeekStart && t < lastWeekStart + elapsed;
      })
      .reduce((sum, w) => sum + workoutVolume(w), 0);
    return {
      weeks,
      lastWeekToDateKg,
      streak: weekStreak(completed, weeklyGoal, now),
      days: trainedDays(completed),
      records: personalRecords(completed).filter((r) => r.improved).slice(0, 5),
      body,
      bodyMonthAgo: [...body].reverse().find((p) => p.date <= monthAgo) ?? null,
      recentCount: recent.length,
      averageMinutes: minutes.length ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length) : 0,
    };
  }, [completed, state.body, weeklyGoal, now]);

  const thisWeek = stats.weeks[stats.weeks.length - 1]!;
  const weekStart = startOfWeek(now);
  const remaining = Math.max(0, weeklyGoal - thisWeek.workouts);
  const change =
    stats.lastWeekToDateKg > 0
      ? Math.round(((thisWeek.volumeKg - stats.lastWeekToDateKg) / stats.lastWeekToDateKg) * 100)
      : null;
  const latestBody = stats.body[stats.body.length - 1] ?? null;
  const bodyChange = latestBody && stats.bodyMonthAgo ? latestBody.averageKg - stats.bodyMonthAgo.averageKg : null;
  const isEmpty = completed.length === 0 && !active;

  return (
    <>
      <header className="page-head">
        <div className="stack" style={{ gap: 4 }}>
          <p className="eyebrow">
            {fmt.weekdayLong(now)} · Week {isoWeek(now)}
          </p>
          <h1 className="page-title">Today</h1>
        </div>
      </header>

      {state.sampleIds.length > 0 && (
        <div className="banner banner-plain" role="note">
          <span className="small muted">You are looking at sample data, not your own training.</span>
          <button type="button" className="btn btn-sm" onClick={() => store.clearSample()}>
            Remove sample data
          </button>
        </div>
      )}

      {!active && backupDue(state, now, cloud.userId !== null) && (
        <div className="banner banner-plain" role="note" data-testid="backup-reminder">
          <div className="stack" style={{ gap: 2, flex: '1 1 240px' }}>
            <strong>Back up your training</strong>
            <span className="small muted">
              {state.settings.lastBackupAt
                ? 'You have new workouts since your last backup a while ago.'
                : 'Your workouts are only saved on this device. A backup keeps them safe if it is lost or reset.'}
            </span>
          </div>
          <button type="button" className="btn" onClick={() => void backUpNow()}>
            Back up now
          </button>
        </div>
      )}

      {active && (
        <div className="banner">
          <div className="stack" style={{ gap: 2 }}>
            <strong>{active.name} in progress</strong>
            <span className="small muted">
              {formatClock(now.getTime() - Date.parse(active.startedAt))} elapsed · {workoutSetCount(active)} sets done
            </span>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => navigate('workout')}>
            <Icon name="play" size={16} />
            Resume
          </button>
        </div>
      )}

      {isEmpty ? (
        <section className="empty">
          <h2 className="section-title">Nothing logged yet</h2>
          <p className="muted prose">
            Start a session below and this page fills with your week, your streak and your records. To see how it looks
            with history first, load ten weeks of example training. You can remove it again in one tap.
          </p>
          <button type="button" className="btn btn-primary" onClick={loadSampleData}>
            Load sample data
          </button>
        </section>
      ) : (
        <section className="hero" aria-label="This week">
          <div className="stack" style={{ gap: 10 }}>
            <p className="eyebrow">This week</p>
            <p className="hero-count">
              <strong className="num" data-testid="week-count">
                {thisWeek.workouts}
              </strong>
              <span>of {weeklyGoal} sessions</span>
            </p>
            <p className="muted">
              {remaining === 0
                ? thisWeek.workouts > weeklyGoal
                  ? 'Goal beaten. Anything more this week is a bonus plate.'
                  : 'Goal reached. The bar is loaded.'
                : `${remaining} more to load the bar${stats.streak > 0 ? ` and keep a ${stats.streak}-week streak going` : ''}.`}
            </p>
          </div>
          <div className="stack" style={{ gap: 12 }}>
            <WeekBar done={thisWeek.workouts} goal={weeklyGoal} />
            <div className="weekdays">
              {DAY_LETTERS.map((letter, i) => {
                const day = addDays(weekStart, i);
                const trained = stats.days.has(dayKey(day));
                const today = dayKey(day) === dayKey(now);
                return (
                  <span className="weekday" key={letter} data-trained={trained} data-today={today}>
                    <i aria-hidden="true" />
                    {letter}
                    <span className="visually-hidden">{trained ? ', trained' : ', rest'}{today ? ', today' : ''}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {!active && <StartPanel />}

      {!isEmpty && (
        <>
          <section className="tiles" aria-label="Summary">
            <div className="tile">
              <span className="tile-label">Streak</span>
              <span className="tile-value">
                {stats.streak}
                <small>{stats.streak === 1 ? 'week' : 'weeks'}</small>
              </span>
              <span className="tile-note">at {weeklyGoal} sessions a week</span>
            </div>
            <div className="tile">
              <span className="tile-label">Volume this week</span>
              <span className="tile-value">
                {formatCompact(toDisplay(thisWeek.volumeKg, units))}
                <small>{units}</small>
              </span>
              <span className="tile-note">
                {change === null ? (
                  'Nothing by this point last week'
                ) : (
                  <>
                    <span className={change >= 0 ? 'delta-up' : 'delta-down'}>
                      {change >= 0 ? '▲' : '▼'} {Math.abs(change)}%
                    </span>{' '}
                    vs this point last week
                  </>
                )}
              </span>
            </div>
            <div className="tile">
              <span className="tile-label">Sessions, last 30 days</span>
              <span className="tile-value">{stats.recentCount}</span>
              <span className="tile-note">{stats.recentCount > 0 ? `${stats.averageMinutes} min on average` : 'None yet'}</span>
            </div>
            <div className="tile">
              <span className="tile-label">Body weight</span>
              <span className="tile-value">
                {latestBody ? formatWeight(latestBody.averageKg, units) : '–'}
                {latestBody && <small>{units}</small>}
              </span>
              <span className="tile-note">
                {!latestBody
                  ? 'Log it under Progress'
                  : bodyChange === null
                    ? '7-reading average'
                    : `${bodyChange > 0 ? '+' : bodyChange < 0 ? '−' : ''}${formatWeight(Math.abs(bodyChange), units)} ${units} in 30 days`}
              </span>
            </div>
          </section>

          <div className="grid-2">
            <section className="card" aria-labelledby="volume-title">
              <div className="card-head">
                <h2 className="section-title" id="volume-title">
                  Weekly volume
                </h2>
                <span className="small faint">Last 8 weeks, {units}</span>
              </div>
              <ColumnChart
                data={stats.weeks.map((week) => ({
                  key: dayKey(week.weekStart),
                  label: fmt.dayMonth(week.weekStart),
                  title: `Week of ${fmt.dayMonth(week.weekStart)}`,
                  value: Math.round(toDisplay(week.volumeKg, units)),
                }))}
                format={(v) => `${formatCompact(v)} ${units}`}
                formatAxis={formatCompact}
                valueHeading={`Volume (${units})`}
                categoryHeading="Week"
                ariaLabel="Lifted volume per week"
              />
            </section>

            <section className="card" aria-labelledby="records-title">
              <div className="card-head">
                <h2 className="section-title" id="records-title">
                  Latest records
                </h2>
                <a className="small" href="#progress">
                  All progress
                </a>
              </div>
              {stats.records.length === 0 ? (
                <p className="muted small">Beat an earlier session on any lift and it shows up here.</p>
              ) : (
                <ul className="list">
                  {stats.records.map((record) => (
                    <li key={record.exerciseId}>
                      <span className="list-main">
                        <strong>{record.name}</strong>
                        <span className="small faint">{relativeDay(record.date, now)}</span>
                      </span>
                      <span className="list-value num">
                        {record.best.weightKg > 0 ? (
                          <>
                            {formatWeight(record.best.weightKg, units)}
                            <small>
                              {units} × {record.best.reps}
                            </small>
                          </>
                        ) : (
                          <>
                            {record.best.reps}
                            <small>reps</small>
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
