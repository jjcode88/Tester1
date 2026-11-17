import { store, useWorkouts } from '../app';
import { TEMPLATES } from '../lib/templates';
import type { Workout } from '../lib/types';
import { navigate } from '../lib/ui';
import { Icon } from './Icon';

/** The routine trained longest ago — a nudge, only once there is history to go on. */
function suggestTemplate(completed: Workout[]): string | null {
  const lastUsed = new Map<string, string>();
  for (const w of completed) lastUsed.set(w.name, w.startedAt);
  const used = TEMPLATES.filter((t) => lastUsed.has(t.name));
  if (used.length < 2) return null;
  used.sort((a, b) => lastUsed.get(a.name)!.localeCompare(lastUsed.get(b.name)!));
  return used[0]!.id;
}

export function StartPanel() {
  const { completed } = useWorkouts();
  const suggested = suggestTemplate(completed);
  const ordered = suggested ? [...TEMPLATES].sort((a, b) => Number(b.id === suggested) - Number(a.id === suggested)) : TEMPLATES;

  return (
    <section className="card" aria-labelledby="start-title">
      <div className="card-head">
        <h2 className="section-title" id="start-title">
          Start a session
        </h2>
        <span className="small faint">Weights fill in from your last time</span>
      </div>
      <div className="start-grid">
        {ordered.map((template) => (
          <button
            key={template.id}
            type="button"
            className="template"
            data-suggested={template.id === suggested}
            onClick={() => {
              store.startWorkout({ kind: 'template', templateId: template.id });
              navigate('workout');
            }}
          >
            <strong>{template.name}</strong>
            <span>{template.id === suggested ? 'Up next · ' : ''}{template.focus}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn"
        onClick={() => {
          store.startWorkout({ kind: 'empty' });
          navigate('workout');
        }}
      >
        <Icon name="plus" size={18} />
        Start an empty session
      </button>
    </section>
  );
}
