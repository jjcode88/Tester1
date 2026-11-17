import type { PlateSpec } from '../lib/plates';

/**
 * The week drawn as a barbell: one plate slides on for every finished session,
 * and the empty outlines are what is left of the weekly goal.
 */
export function WeekBar({ done, goal }: { done: number; goal: number }) {
  const slots = Math.max(goal, done, 1);
  const width = 320;
  const startX = 44;
  const available = width - startX - 34;
  const gap = slots > 8 ? 3 : 5;
  const plateWidth = Math.min(26, (available - gap * (slots - 1)) / slots);

  return (
    <svg className="weekbar" viewBox={`0 0 ${width} 92`} role="img" aria-label={`${done} of ${goal} sessions done this week`}>
      <rect x="4" y="42" width={width - 8} height="8" rx="4" fill="var(--steel)" />
      <rect x="30" y="34" width="8" height="24" rx="2" fill="var(--steel)" />
      {Array.from({ length: slots }, (_, i) => {
        const filled = i < done;
        const bonus = i >= goal;
        // Plates past the goal are the smaller change plates.
        const height = bonus ? 58 : 80;
        return (
          <rect
            key={i}
            x={startX + i * (plateWidth + gap)}
            y={46 - height / 2}
            width={plateWidth}
            height={height}
            rx={Math.min(5, plateWidth / 3)}
            fill={filled ? (bonus ? 'var(--plate-yellow)' : 'var(--plate-blue)') : 'var(--surface)'}
            stroke={filled ? 'none' : 'var(--line-strong)'}
            strokeWidth={filled ? 0 : 1.5}
            strokeDasharray={filled ? undefined : '4 3'}
          />
        );
      })}
      <rect x={width - 26} y="38" width="6" height="16" rx="2" fill="var(--steel)" />
    </svg>
  );
}

const THICKNESS = (plate: PlateSpec) => Math.round(8 + plate.size * 12);

/** One end of a loaded bar, plates in loading order from the collar outwards. */
export function LoadedBar({ plates, label }: { plates: PlateSpec[]; label: string }) {
  const width = 360;
  let cursor = 96;
  return (
    <svg className="barbell" viewBox={`0 0 ${width} 132`} role="img" aria-label={label}>
      <rect x="0" y="62" width="84" height="8" fill="var(--steel)" />
      <rect x="76" y="50" width="14" height="32" rx="2" fill="var(--steel)" />
      <rect x="90" y="58" width={width - 110} height="16" rx="3" fill="var(--steel)" />
      {plates.map((plate, i) => {
        const w = THICKNESS(plate);
        const h = plate.size * 124;
        const x = cursor;
        cursor += w + 2;
        return (
          <rect
            key={i}
            x={x}
            y={66 - h / 2}
            width={w}
            height={h}
            rx="3"
            fill={plate.color}
            stroke="rgb(16 21 29 / 0.25)"
            strokeWidth="1"
          />
        );
      })}
    </svg>
  );
}
