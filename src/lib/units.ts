import type { Units } from './types';

export const LB_PER_KG = 2.2046226218;

export function toDisplay(kg: number, units: Units): number {
  return units === 'kg' ? kg : kg * LB_PER_KG;
}

export function fromDisplay(value: number, units: Units): number {
  return units === 'kg' ? value : value / LB_PER_KG;
}

export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** "82.5", "100", "1,240" — at most one decimal, no trailing zero. */
export function formatNumber(value: number, maxDecimals = 1): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: maxDecimals }).format(value);
}

/**
 * A stored kg value in the user's units, e.g. "82.5" or "181.9". Kilograms keep
 * two decimals so 1.25 kg plates show exactly; converted pounds keep one.
 */
export function formatWeight(kg: number, units: Units, maxDecimals = units === 'kg' ? 2 : 1): string {
  return formatNumber(toDisplay(kg, units), maxDecimals);
}

/** Compact totals for volume: 940, 12.4K, 1.2M. */
export function formatCompact(value: number): string {
  if (Math.abs(value) < 10_000) return formatNumber(Math.round(value), 0);
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/** Parses user input such as "82,5" or " 100 ". Returns null when not a number. */
export function parseNumber(input: string): number | null {
  const cleaned = input.trim().replace(',', '.');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
