import { describe, expect, it } from 'vitest';
import { dayKey, daysBetween, formatClock, formatDuration, isoWeek, parseDayKey, relativeDay, startOfWeek } from './dates';
import { customExerciseId, EXERCISES, searchExercises } from './exercises';
import { seededRandom, seededUuid, uuid } from './ids';
import { loadBar, warmupSets } from './plates';
import { buildSampleData } from './seed';
import { TEMPLATES } from './templates';
import { formatCompact, formatWeight, fromDisplay, parseNumber, toDisplay } from './units';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('units', () => {
  it('round-trips pounds through the stored kilogram value', () => {
    expect(toDisplay(fromDisplay(135, 'lb'), 'lb')).toBeCloseTo(135, 9);
    expect(formatWeight(fromDisplay(135, 'lb'), 'lb')).toBe('135');
    expect(formatWeight(82.5, 'kg')).toBe('82.5');
    expect(formatWeight(33.75, 'kg')).toBe('33.75');
    expect(formatWeight(33.75, 'lb')).toBe('74.4');
    expect(formatWeight(100, 'lb')).toBe('220.5');
  });

  it('formats totals compactly past 10,000', () => {
    expect(formatCompact(9400)).toBe('9,400');
    expect(formatCompact(12_430)).toBe('12.4K');
  });

  it('parses decimal commas and rejects junk', () => {
    expect(parseNumber(' 82,5 ')).toBe(82.5);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });
});

describe('dates', () => {
  it('uses Monday as the first day of the week', () => {
    expect(dayKey(startOfWeek(new Date('2026-11-22T23:59:00')))).toBe('2026-11-16'); // Sunday
    expect(dayKey(startOfWeek(new Date('2026-11-16T00:00:00')))).toBe('2026-11-16'); // Monday
  });

  it('computes ISO week numbers across year boundaries', () => {
    expect(isoWeek(new Date('2026-11-16T12:00:00'))).toBe(47);
    expect(isoWeek(new Date('2027-01-01T12:00:00'))).toBe(53);
    expect(isoWeek(new Date('2027-01-04T12:00:00'))).toBe(1);
  });

  it('round-trips day keys in local time', () => {
    expect(dayKey(parseDayKey('2026-03-08'))).toBe('2026-03-08');
    expect(daysBetween(parseDayKey('2026-03-01'), parseDayKey('2026-04-01'))).toBe(31);
  });

  it('formats durations, clocks and relative days', () => {
    expect(formatDuration(65 * 60_000)).toBe('1 h 05 min');
    expect(formatDuration(42 * 60_000)).toBe('42 min');
    expect(formatClock(75_000)).toBe('1:15');
    expect(formatClock(3_725_000)).toBe('1:02:05');
    const now = new Date('2026-11-16T12:00:00');
    expect(relativeDay(new Date('2026-11-16T01:00:00'), now)).toBe('Today');
    expect(relativeDay(new Date('2026-11-15T23:00:00'), now)).toBe('Yesterday');
    expect(relativeDay(new Date('2026-11-12T12:00:00'), now)).toBe('4 days ago');
    expect(relativeDay(new Date('2026-10-01T12:00:00'), now)).toBe('1 Oct');
  });
});

describe('ids', () => {
  it('generates valid v4 UUIDs', () => {
    expect(uuid()).toMatch(UUID_V4);
    expect(seededUuid(seededRandom(1))).toMatch(UUID_V4);
  });

  it('is deterministic for a seed', () => {
    expect(seededUuid(seededRandom(7))).toBe(seededUuid(seededRandom(7)));
    expect(seededUuid(seededRandom(7))).not.toBe(seededUuid(seededRandom(8)));
  });
});

describe('plate loading', () => {
  it('loads the heaviest plates first', () => {
    const result = loadBar(100, 20, 'kg');
    expect(result.perSide.map((p) => p.weight)).toEqual([25, 15]);
    expect(result.loaded).toBe(100);
    expect(result.remainder).toBe(0);
  });

  it('handles fractional plates without float drift', () => {
    const result = loadBar(62.5, 20, 'kg');
    expect(result.perSide.map((p) => p.weight)).toEqual([20, 1.25]);
    expect(result.loaded).toBe(62.5);
  });

  it('reports what cannot be loaded', () => {
    const result = loadBar(101, 20, 'kg');
    expect(result.loaded).toBe(100);
    expect(result.remainder).toBe(1);
  });

  it('returns an empty bar at or below bar weight', () => {
    expect(loadBar(20, 20, 'kg').perSide).toEqual([]);
    expect(loadBar(10, 20, 'kg').perSide).toEqual([]);
  });

  it('supports pound plates', () => {
    expect(loadBar(225, 45, 'lb').perSide.map((p) => p.weight)).toEqual([45, 45]);
    expect(loadBar(135, 45, 'lb').perSide.map((p) => p.weight)).toEqual([45]);
  });

  it('builds an ascending warm-up ramp below the working weight', () => {
    const ramp = warmupSets(100, 20, 'kg');
    expect(ramp.map((s) => s.weight)).toEqual([20, 40, 60, 75, 90]);
    expect(ramp.every((s) => s.weight < 100)).toBe(true);
    expect(warmupSets(20, 20, 'kg')).toEqual([]);
    // Light working weights collapse duplicate steps.
    const light = warmupSets(30, 20, 'kg').map((s) => s.weight);
    expect(new Set(light).size).toBe(light.length);
  });
});

describe('exercise library', () => {
  it('has unique ids and every template refers to a real exercise', () => {
    const ids = new Set(EXERCISES.map((e) => e.id));
    expect(ids.size).toBe(EXERCISES.length);
    for (const template of TEMPLATES) {
      for (const item of template.items) expect(ids.has(item.exerciseId), item.exerciseId).toBe(true);
    }
  });

  it('searches by name and muscle group', () => {
    expect(searchExercises('squat', 'all').map((e) => e.id)).toContain('front-squat');
    expect(searchExercises('', 'core').every((e) => e.muscle === 'core')).toBe(true);
    expect(searchExercises('zzz', 'all')).toEqual([]);
  });

  it('slugs custom names', () => {
    expect(customExerciseId('  Zercher Squat! ')).toBe('custom-zercher-squat');
    expect(customExerciseId('***')).toBe('custom-exercise');
  });
});

describe('sample data', () => {
  const now = new Date('2026-11-16T20:30:00');

  it('is deterministic and never in the future', () => {
    const a = buildSampleData(now);
    const b = buildSampleData(now);
    expect(a).toEqual(b);
    expect(a.workouts.length).toBeGreaterThan(25);
    expect(a.workouts.every((w) => new Date(w.startedAt) <= now && w.endedAt !== null)).toBe(true);
    expect(a.body.at(-1)!.date).toBe('2026-11-16');
  });

  it('uses valid ids and known exercises', () => {
    const { workouts, body } = buildSampleData(now);
    const ids = [...workouts.map((w) => w.id), ...body.map((b) => b.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => UUID_V4.test(id))).toBe(true);
    const known = new Set(EXERCISES.map((e) => e.id));
    expect(workouts.every((w) => w.exercises.every((e) => known.has(e.exerciseId)))).toBe(true);
  });
});
