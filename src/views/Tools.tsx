import { useState } from 'react';
import { useAppState } from '../app';
import { NumberField } from '../components/common';
import { LoadedBar } from '../components/graphics';
import { brzycki, estimateOneRepMax } from '../lib/analytics';
import { DEFAULT_BAR, loadBar, warmupSets } from '../lib/plates';
import type { Units } from '../lib/types';
import { formatNumber } from '../lib/units';

const PERCENTAGES: Array<[percent: number, reps: string]> = [
  [95, '2'],
  [90, '3–4'],
  [85, '5–6'],
  [80, '7–8'],
  [75, '9–10'],
  [70, '11–12'],
  [65, '14–15'],
];

export function Tools() {
  const { units } = useAppState().settings;
  return (
    <>
      <header className="page-head">
        <div className="stack" style={{ gap: 4 }}>
          <p className="eyebrow">Working in {units === 'kg' ? 'kilograms' : 'pounds'}</p>
          <h1 className="page-title">Tools</h1>
        </div>
      </header>
      {/* Remount on a unit change so the defaults match the new unit. */}
      <div className="grid-2" key={units}>
        <PlateCalculator units={units} />
        <OneRepMax units={units} />
      </div>
    </>
  );
}

function PlateCalculator({ units }: { units: Units }) {
  const [target, setTarget] = useState<number | null>(units === 'kg' ? 100 : 225);
  const [bar, setBar] = useState<number | null>(DEFAULT_BAR[units]);
  const barWeight = bar ?? DEFAULT_BAR[units];
  const result = loadBar(target ?? 0, barWeight, units);
  const warmup = warmupSets(target ?? 0, barWeight, units);
  const counts = new Map<number, { count: number; color: string }>();
  for (const plate of result.perSide) {
    counts.set(plate.weight, { count: (counts.get(plate.weight)?.count ?? 0) + 1, color: plate.color });
  }

  return (
    <section className="card" aria-labelledby="plates-title">
      <div className="card-head">
        <h2 className="section-title" id="plates-title">
          Plate calculator
        </h2>
        <span className="small faint">What goes on each side</span>
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="plate-target">Target weight</label>
          <div className="input-suffix">
            <NumberField id="plate-target" value={target} onCommit={setTarget} max={1500} />
            <span>{units}</span>
          </div>
        </div>
        <div className="field">
          <label htmlFor="plate-bar">Bar</label>
          <div className="input-suffix">
            <NumberField id="plate-bar" value={bar} onCommit={setBar} max={100} />
            <span>{units}</span>
          </div>
        </div>
      </div>

      <LoadedBar
        plates={result.perSide}
        label={
          result.perSide.length > 0
            ? `One side of the bar: ${result.perSide.map((p) => p.weight).join(', ')} ${units}`
            : 'An empty bar'
        }
      />

      {result.perSide.length > 0 ? (
        <div className="stack" style={{ gap: 8 }}>
          <span className="label">Per side</span>
          <div className="plate-list" data-testid="plates-per-side">
            {[...counts.entries()].map(([weight, { count, color }]) => (
              <span className="plate-chip" key={weight}>
                <i style={{ background: color }} />
                {count > 1 ? `${count} × ` : ''}
                {formatNumber(weight, 2)}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="muted small">{(target ?? 0) > 0 ? 'Just the bar. Nothing to load.' : 'Enter a target weight.'}</p>
      )}

      {result.remainder > 0 && result.perSide.length > 0 && (
        <p className="notice">
          Closest loadable weight is {formatNumber(result.loaded, 2)} {units}, which is {formatNumber(result.remainder, 2)} {units} under the
          target.
        </p>
      )}

      {warmup.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="label">Warm-up ramp</span>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Set</th>
                  <th className="num">Weight</th>
                  <th className="num">Reps</th>
                </tr>
              </thead>
              <tbody>
                {warmup.map((set, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td className="num">
                      {formatNumber(set.weight, 2)} {units}
                    </td>
                    <td className="num">{set.reps}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function OneRepMax({ units }: { units: Units }) {
  const [weight, setWeight] = useState<number | null>(units === 'kg' ? 80 : 185);
  const [reps, setReps] = useState<number | null>(5);
  const w = weight ?? 0;
  const r = Math.round(reps ?? 0);
  // Two common formulas; their mean is steadier than either alone.
  const estimate = w > 0 && r > 0 ? (estimateOneRepMax(w, r) + brzycki(w, r)) / 2 : 0;
  const step = units === 'kg' ? 2.5 : 5;

  return (
    <section className="card" aria-labelledby="orm-title">
      <div className="card-head">
        <h2 className="section-title" id="orm-title">
          One-rep max
        </h2>
        <span className="small faint">Estimated from a hard set</span>
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="orm-weight">Weight lifted</label>
          <div className="input-suffix">
            <NumberField id="orm-weight" value={weight} onCommit={setWeight} max={1500} />
            <span>{units}</span>
          </div>
        </div>
        <div className="field">
          <label htmlFor="orm-reps">Reps</label>
          <NumberField id="orm-reps" value={reps} onCommit={setReps} max={30} decimals={0} />
        </div>
      </div>

      {estimate > 0 ? (
        <>
          <p className="result" data-testid="orm-result">
            <strong className="num">{formatNumber(estimate)}</strong>
            <span>{units} estimated max</span>
          </p>
          {r > 10 && <p className="notice">Estimates get loose past 10 reps. A set of 3 to 6 gives a tighter number.</p>}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Intensity</th>
                  <th className="num">Load</th>
                  <th className="num">Typical reps</th>
                </tr>
              </thead>
              <tbody>
                {PERCENTAGES.map(([percent, typical]) => (
                  <tr key={percent}>
                    <td>{percent}%</td>
                    <td className="num">
                      {formatNumber(Math.round((estimate * percent) / 100 / step) * step, 1)} {units}
                    </td>
                    <td className="num">{typical}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small faint">Mean of the Epley and Brzycki formulas, loads rounded to {step} {units}.</p>
        </>
      ) : (
        <p className="muted small">Enter a weight and the reps you managed with it.</p>
      )}
    </section>
  );
}
