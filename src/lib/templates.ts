export interface TemplateItem {
  exerciseId: string;
  sets: number;
  reps: number;
}

export interface Template {
  id: string;
  name: string;
  focus: string;
  items: TemplateItem[];
}

const item = (exerciseId: string, sets: number, reps: number): TemplateItem => ({ exerciseId, sets, reps });

export const TEMPLATES: Template[] = [
  {
    id: 'push',
    name: 'Push',
    focus: 'Chest, shoulders, triceps',
    items: [
      item('bench-press', 4, 6),
      item('overhead-press', 3, 8),
      item('incline-db-press', 3, 10),
      item('lateral-raise', 3, 15),
      item('triceps-pushdown', 3, 12),
    ],
  },
  {
    id: 'pull',
    name: 'Pull',
    focus: 'Back, biceps',
    items: [
      item('deadlift', 3, 5),
      item('pull-up', 3, 8),
      item('barbell-row', 3, 8),
      item('face-pull', 3, 15),
      item('barbell-curl', 3, 10),
    ],
  },
  {
    id: 'legs',
    name: 'Legs',
    focus: 'Quads, hamstrings, glutes',
    items: [
      item('squat', 4, 6),
      item('romanian-deadlift', 3, 8),
      item('leg-press', 3, 12),
      item('leg-curl', 3, 12),
      item('calf-raise', 4, 12),
    ],
  },
  {
    id: 'upper',
    name: 'Upper',
    focus: 'Whole upper body',
    items: [
      item('bench-press', 3, 8),
      item('barbell-row', 3, 8),
      item('db-shoulder-press', 3, 10),
      item('lat-pulldown', 3, 10),
      item('db-curl', 2, 12),
      item('triceps-pushdown', 2, 12),
    ],
  },
  {
    id: 'lower',
    name: 'Lower',
    focus: 'Legs and core',
    items: [
      item('squat', 3, 8),
      item('hip-thrust', 3, 10),
      item('bulgarian-split-squat', 3, 10),
      item('leg-extension', 3, 12),
      item('hanging-leg-raise', 3, 12),
    ],
  },
  {
    id: 'full-body',
    name: 'Full body',
    focus: 'One lift per movement pattern',
    items: [
      item('squat', 3, 5),
      item('bench-press', 3, 5),
      item('barbell-row', 3, 8),
      item('overhead-press', 2, 8),
      item('plank', 3, 1),
    ],
  },
];

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
