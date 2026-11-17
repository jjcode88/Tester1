import type { Units } from './types';

export interface PlateSpec {
  weight: number;
  /** IWF competition colours for kg plates; common bumper colours for lb. */
  color: string;
  /** Relative drawn height, 0–1. */
  size: number;
}

export const PLATES: Record<Units, PlateSpec[]> = {
  kg: [
    { weight: 25, color: 'var(--plate-red)', size: 1 },
    { weight: 20, color: 'var(--plate-blue)', size: 1 },
    { weight: 15, color: 'var(--plate-yellow)', size: 0.92 },
    { weight: 10, color: 'var(--plate-green)', size: 0.8 },
    { weight: 5, color: 'var(--plate-white)', size: 0.62 },
    { weight: 2.5, color: 'var(--plate-red)', size: 0.5 },
    { weight: 1.25, color: 'var(--plate-steel)', size: 0.42 },
  ],
  lb: [
    { weight: 45, color: 'var(--plate-blue)', size: 1 },
    { weight: 35, color: 'var(--plate-yellow)', size: 0.92 },
    { weight: 25, color: 'var(--plate-green)', size: 0.8 },
    { weight: 10, color: 'var(--plate-white)', size: 0.62 },
    { weight: 5, color: 'var(--plate-red)', size: 0.5 },
    { weight: 2.5, color: 'var(--plate-steel)', size: 0.42 },
  ],
};

export const DEFAULT_BAR: Record<Units, number> = { kg: 20, lb: 45 };

export interface PlateResult {
  /** Plates for ONE side of the bar, heaviest first. */
  perSide: PlateSpec[];
  /** Weight actually loaded, including the bar. */
  loaded: number;
  /** Target minus loaded — non-zero when the target can't be hit exactly. */
  remainder: number;
}

/**
 * Loads the heaviest plates first, working in integer hundredths to avoid
 * float drift. When the target can't be made exactly, the result is the
 * nearest loadable weight below it and `remainder` says how much is missing.
 */
export function loadBar(target: number, bar: number, units: Units): PlateResult {
  const scale = 100;
  let perSideLeft = Math.round(((target - bar) / 2) * scale);
  const perSide: PlateSpec[] = [];
  if (perSideLeft > 0) {
    for (const plate of PLATES[units]) {
      const w = Math.round(plate.weight * scale);
      while (perSideLeft >= w) {
        perSide.push(plate);
        perSideLeft -= w;
      }
    }
  }
  const loaded = bar + (perSide.reduce((sum, p) => sum + Math.round(p.weight * scale), 0) * 2) / scale;
  return { perSide, loaded, remainder: Math.round((target - loaded) * scale) / scale };
}

/** Warm-up ramp towards a working weight, rounded to loadable jumps. */
export function warmupSets(working: number, bar: number, units: Units): Array<{ weight: number; reps: number }> {
  const step = units === 'kg' ? 2.5 : 5;
  const round = (v: number) => Math.max(bar, Math.round(v / step) * step);
  if (working <= bar) return [];
  const ramp: Array<[number, number]> = [
    [0, 10],
    [0.4, 5],
    [0.6, 3],
    [0.75, 2],
    [0.9, 1],
  ];
  const out: Array<{ weight: number; reps: number }> = [];
  for (const [pct, reps] of ramp) {
    const weight = pct === 0 ? bar : round(working * pct);
    if (weight >= working) continue;
    if (out.length > 0 && out[out.length - 1]!.weight === weight) continue;
    out.push({ weight, reps });
  }
  return out;
}
