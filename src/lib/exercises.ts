import type { Equipment, ExerciseDef, MuscleGroup } from './types';

const def = (id: string, name: string, muscle: MuscleGroup, equipment: Equipment): ExerciseDef => ({
  id,
  name,
  muscle,
  equipment,
});

export const EXERCISES: ExerciseDef[] = [
  def('bench-press', 'Bench press', 'chest', 'barbell'),
  def('incline-bench-press', 'Incline bench press', 'chest', 'barbell'),
  def('db-bench-press', 'Dumbbell bench press', 'chest', 'dumbbell'),
  def('incline-db-press', 'Incline dumbbell press', 'chest', 'dumbbell'),
  def('chest-fly', 'Cable fly', 'chest', 'cable'),
  def('machine-chest-press', 'Machine chest press', 'chest', 'machine'),
  def('push-up', 'Push-up', 'chest', 'bodyweight'),
  def('dip', 'Dip', 'chest', 'bodyweight'),

  def('deadlift', 'Deadlift', 'back', 'barbell'),
  def('barbell-row', 'Barbell row', 'back', 'barbell'),
  def('pull-up', 'Pull-up', 'back', 'bodyweight'),
  def('chin-up', 'Chin-up', 'back', 'bodyweight'),
  def('lat-pulldown', 'Lat pulldown', 'back', 'cable'),
  def('seated-cable-row', 'Seated cable row', 'back', 'cable'),
  def('db-row', 'Dumbbell row', 'back', 'dumbbell'),
  def('t-bar-row', 'T-bar row', 'back', 'barbell'),
  def('face-pull', 'Face pull', 'back', 'cable'),

  def('overhead-press', 'Overhead press', 'shoulders', 'barbell'),
  def('db-shoulder-press', 'Dumbbell shoulder press', 'shoulders', 'dumbbell'),
  def('lateral-raise', 'Lateral raise', 'shoulders', 'dumbbell'),
  def('rear-delt-fly', 'Rear delt fly', 'shoulders', 'dumbbell'),
  def('arnold-press', 'Arnold press', 'shoulders', 'dumbbell'),
  def('upright-row', 'Upright row', 'shoulders', 'barbell'),

  def('barbell-curl', 'Barbell curl', 'arms', 'barbell'),
  def('db-curl', 'Dumbbell curl', 'arms', 'dumbbell'),
  def('hammer-curl', 'Hammer curl', 'arms', 'dumbbell'),
  def('preacher-curl', 'Preacher curl', 'arms', 'machine'),
  def('triceps-pushdown', 'Triceps pushdown', 'arms', 'cable'),
  def('skull-crusher', 'Skull crusher', 'arms', 'barbell'),
  def('overhead-triceps-extension', 'Overhead triceps extension', 'arms', 'cable'),
  def('close-grip-bench', 'Close-grip bench press', 'arms', 'barbell'),

  def('squat', 'Back squat', 'legs', 'barbell'),
  def('front-squat', 'Front squat', 'legs', 'barbell'),
  def('romanian-deadlift', 'Romanian deadlift', 'legs', 'barbell'),
  def('leg-press', 'Leg press', 'legs', 'machine'),
  def('leg-extension', 'Leg extension', 'legs', 'machine'),
  def('leg-curl', 'Leg curl', 'legs', 'machine'),
  def('bulgarian-split-squat', 'Bulgarian split squat', 'legs', 'dumbbell'),
  def('walking-lunge', 'Walking lunge', 'legs', 'dumbbell'),
  def('hip-thrust', 'Hip thrust', 'legs', 'barbell'),
  def('calf-raise', 'Standing calf raise', 'legs', 'machine'),
  def('goblet-squat', 'Goblet squat', 'legs', 'kettlebell'),
  def('kettlebell-swing', 'Kettlebell swing', 'legs', 'kettlebell'),

  def('plank', 'Plank', 'core', 'bodyweight'),
  def('hanging-leg-raise', 'Hanging leg raise', 'core', 'bodyweight'),
  def('cable-crunch', 'Cable crunch', 'core', 'cable'),
  def('ab-wheel', 'Ab wheel rollout', 'core', 'bodyweight'),
  def('russian-twist', 'Russian twist', 'core', 'bodyweight'),
];

const byId = new Map(EXERCISES.map((e) => [e.id, e]));

export function findExercise(id: string): ExerciseDef | undefined {
  return byId.get(id);
}

export const MUSCLES: MuscleGroup[] = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'];

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  arms: 'Arms',
  legs: 'Legs',
  core: 'Core',
};

/** Stable id for an exercise the user typed in themselves. */
export function customExerciseId(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `custom-${slug || 'exercise'}`;
}

export function searchExercises(
  query: string,
  muscle: MuscleGroup | 'all',
  extra: ExerciseDef[] = [],
): ExerciseDef[] {
  const q = query.trim().toLowerCase();
  const seen = new Set<string>();
  return [...extra, ...EXERCISES].filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    if (muscle !== 'all' && e.muscle !== muscle) return false;
    return q === '' || e.name.toLowerCase().includes(q);
  });
}
