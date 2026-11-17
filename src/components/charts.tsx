import { useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { niceTicks } from '../lib/analytics';

/** Measures an element so charts draw at real pixel size and text never scales. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// ── Columns ─────────────────────────────────────────────────────────────────

export interface ColumnDatum {
  key: string;
  /** Short axis label. */
  label: string;
  /** Full name for the tooltip and table. */
  title: string;
  value: number;
}

export function ColumnChart({
  data,
  format,
  formatAxis = format,
  valueHeading,
  categoryHeading,
  ariaLabel,
  height = 200,
}: {
  data: ColumnDatum[];
  format: (value: number) => string;
  formatAxis?: (value: number) => string;
  valueHeading: string;
  categoryHeading: string;
  ariaLabel: string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const margin = { top: 20, right: 8, bottom: 24, left: 44 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;
  const base = margin.top + innerH;
  const ticks = niceTicks(0, Math.max(1, ...data.map((d) => d.value)), 4);
  const top = ticks[ticks.length - 1]!;
  const y = (value: number) => base - (value / top) * innerH;
  const band = data.length > 0 ? innerW / data.length : 0;
  // Capped at 24px with at least a 2px gap, so columns stay marks rather than blocks.
  const barWidth = Math.min(24, Math.max(2, band - 2));
  const labelEvery = Math.max(1, Math.ceil(44 / Math.max(1, band)));
  const centre = (i: number) => margin.left + i * band + band / 2;
  const last = data.length - 1;
  const peak = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? 0) ? i : best), 0);
  const activeDatum = active === null ? null : data[active];

  return (
    <div className="stack">
      <div className="chart" ref={ref} style={{ height }}>
        {width > 0 && (
          <svg height={height} role="group" aria-label={ariaLabel}>
            {ticks.map((tick) => (
              <g key={tick}>
                <line className={tick === 0 ? 'axis' : 'grid'} x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} />
                <text x={margin.left - 8} y={y(tick) + 4} textAnchor="end">
                  {formatAxis(tick)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x0 = centre(i) - barWidth / 2;
              const yTop = y(d.value);
              const r = Math.min(4, barWidth / 2, base - yTop);
              return (
                <g key={d.key}>
                  {d.value > 0 && (
                    <path
                      className="bar"
                      data-active={active === i}
                      d={`M${x0} ${base}V${yTop + r}Q${x0} ${yTop} ${x0 + r} ${yTop}H${x0 + barWidth - r}Q${x0 + barWidth} ${yTop} ${x0 + barWidth} ${yTop + r}V${base}Z`}
                    />
                  )}
                  {(last - i) % labelEvery === 0 && (
                    <text x={centre(i)} y={height - 6} textAnchor="middle">
                      {d.label}
                    </text>
                  )}
                  {i === peak && d.value > 0 && active === null && (
                    <text
                      className="value-label"
                      x={centre(i)}
                      y={yTop - 6}
                      textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}
                      dx={i === 0 ? -barWidth / 2 : i === last ? barWidth / 2 : 0}
                    >
                      {format(d.value)}
                    </text>
                  )}
                  <rect
                    className="hit"
                    x={margin.left + i * band}
                    y={margin.top}
                    width={band}
                    height={innerH}
                    tabIndex={0}
                    role="img"
                    aria-label={`${d.title}: ${format(d.value)}`}
                    onPointerEnter={() => setActive(i)}
                    onPointerLeave={() => setActive((current) => (current === i ? null : current))}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive((current) => (current === i ? null : current))}
                  />
                </g>
              );
            })}
          </svg>
        )}
        {activeDatum && active !== null && (
          <div className="chart-tip" style={{ left: clamp(centre(active), 70, width - 70), top: y(activeDatum.value) - 8 }}>
            <strong>{format(activeDatum.value)}</strong>
            {activeDatum.title}
          </div>
        )}
      </div>
      <details className="chart-table">
        <summary>Show as table</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{categoryHeading}</th>
                <th className="num">{valueHeading}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.key}>
                  <td>{d.title}</td>
                  <td className="num">{format(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

// ── Lines ───────────────────────────────────────────────────────────────────

export interface LineSeries {
  key: string;
  name: string;
  /** A CSS colour, normally a var(--series-…) token. */
  color: string;
  points: Array<{ x: number; y: number }>;
}

/**
 * Time series on one shared axis. The first series is the subject: it gets the
 * area wash, the end label and the crosshair; later series are context.
 */
export function LineChart({
  series,
  formatX,
  formatY,
  dateHeading = 'Date',
  ariaLabel,
  height = 220,
}: {
  series: LineSeries[];
  formatX: (x: number) => string;
  formatY: (y: number) => string;
  dateHeading?: string;
  ariaLabel: string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const primary = series[0];
  const points = primary?.points ?? [];

  const margin = { top: 14, right: 54, bottom: 24, left: 44 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;
  const base = margin.top + innerH;

  const allX = series.flatMap((s) => s.points.map((p) => p.x));
  const allY = series.flatMap((s) => s.points.map((p) => p.y));
  let xMin = Math.min(...allX);
  let xMax = Math.max(...allX);
  if (xMin === xMax) {
    xMin -= 86_400_000;
    xMax += 86_400_000;
  }
  const ticks = niceTicks(Math.min(...allY), Math.max(...allY), 4);
  const yMin = ticks[0]!;
  const yMax = ticks[ticks.length - 1]!;
  const x = (value: number) => margin.left + ((value - xMin) / (xMax - xMin)) * innerW;
  const y = (value: number) => base - ((value - yMin) / (yMax - yMin)) * innerH;
  const path = (pts: LineSeries['points']) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.x).toFixed(1)} ${y(p.y).toFixed(1)}`).join('');

  const tickCount = width < 420 ? 3 : 5;
  const xTicks = Array.from({ length: tickCount }, (_, i) => xMin + ((xMax - xMin) * i) / (tickCount - 1));

  function nearest(event: PointerEvent<SVGSVGElement>) {
    if (points.length === 0) return;
    const px = event.clientX - event.currentTarget.getBoundingClientRect().left;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(x(points[i]!.x) - px) < Math.abs(x(points[best]!.x) - px)) best = i;
    }
    setActive(best);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (points.length === 0) return;
    const current = active ?? points.length - 1;
    const next =
      event.key === 'ArrowLeft'
        ? current - 1
        : event.key === 'ArrowRight'
          ? current + 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? points.length - 1
              : null;
    if (event.key === 'Escape') setActive(null);
    if (next === null) return;
    event.preventDefault();
    setActive(clamp(next, 0, points.length - 1));
  }

  const activePoint = active === null ? null : points[active];
  const end = points[points.length - 1];

  if (!primary || points.length === 0) return null;

  return (
    <div className="stack">
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.key}>
              <i style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <div
        className="chart"
        ref={ref}
        style={{ height }}
        tabIndex={0}
        role="group"
        aria-label={`${ariaLabel}. Use the left and right arrow keys to read values.`}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((current) => current ?? points.length - 1)}
        onBlur={() => setActive(null)}
      >
        {width > 0 && (
          <svg height={height} onPointerMove={nearest} onPointerDown={nearest} onPointerLeave={() => setActive(null)}>
            {ticks.map((tick) => (
              <g key={tick}>
                <line className="grid" x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} />
                <text x={margin.left - 8} y={y(tick) + 4} textAnchor="end">
                  {formatY(tick)}
                </text>
              </g>
            ))}
            {xTicks.map((tick, i) => (
              <text key={i} x={x(tick)} y={height - 6} textAnchor={i === 0 ? 'start' : i === tickCount - 1 ? 'end' : 'middle'}>
                {formatX(tick)}
              </text>
            ))}
            {activePoint && <line className="crosshair" x1={x(activePoint.x)} x2={x(activePoint.x)} y1={margin.top} y2={base} />}
            {points.length > 1 && (
              <path d={`${path(points)}L${x(end!.x).toFixed(1)} ${base}L${x(points[0]!.x).toFixed(1)} ${base}Z`} fill={primary.color} fillOpacity={0.1} stroke="none" />
            )}
            {/* Context series first, so the subject is drawn on top. */}
            {[...series].reverse().map((s) => (
              <path key={s.key} d={path(s.points)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {end && (
              <>
                <circle cx={x(end.x)} cy={y(end.y)} r={5} fill={primary.color} stroke="var(--surface)" strokeWidth={2} />
                {active === null && (
                  <text className="value-label" x={x(end.x) + 10} y={y(end.y) + 4}>
                    {formatY(end.y)}
                  </text>
                )}
              </>
            )}
            {activePoint &&
              series.map((s) => {
                const p = s.points.find((candidate) => candidate.x === activePoint.x);
                return p ? <circle key={s.key} cx={x(p.x)} cy={y(p.y)} r={5} fill={s.color} stroke="var(--surface)" strokeWidth={2} /> : null;
              })}
          </svg>
        )}
        {activePoint && (
          <div
            className="chart-tip"
            style={{ left: clamp(x(activePoint.x), 80, Math.max(80, width - 80)), top: Math.min(...series.map((s) => y(s.points.find((p) => p.x === activePoint.x)?.y ?? yMin))) - 12 }}
          >
            <div className="tip-title">{formatX(activePoint.x)}</div>
            {series.map((s) => {
              const p = s.points.find((candidate) => candidate.x === activePoint.x);
              return p ? (
                <div className="tip-row" key={s.key}>
                  <span className="tip-key" style={{ background: s.color }} />
                  <strong>{formatY(p.y)}</strong>
                  {series.length > 1 && <span>{s.name}</span>}
                </div>
              ) : null;
            })}
          </div>
        )}
      </div>
      <details className="chart-table">
        <summary>Show as table</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{dateHeading}</th>
                {series.map((s) => (
                  <th className="num" key={s.key}>
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.x}>
                  <td>{formatX(p.x)}</td>
                  {series.map((s) => {
                    const match = s.points.find((candidate) => candidate.x === p.x);
                    return (
                      <td className="num" key={s.key}>
                        {match ? formatY(match.y) : '–'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

// ── Ranked bars ─────────────────────────────────────────────────────────────

/** A short ranked list where every bar carries its own value, so no hover layer is needed. */
export function RankedBars({ rows, unit }: { rows: Array<{ key: string; label: string; value: number }>; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="hbars">
      {rows.map((row) => (
        <div key={row.key} style={{ display: 'contents' }}>
          <span>{row.label}</span>
          <div className="hbar-track" role="img" aria-label={`${row.label}: ${row.value} ${unit}`}>
            {row.value > 0 && <div className="hbar-fill" style={{ width: `${(row.value / max) * 100}%` }} />}
          </div>
          <span className="num">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
