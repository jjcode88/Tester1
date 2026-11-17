import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { formatNumber, parseNumber } from '../lib/units';
import { Icon } from './Icon';

/** A modal sheet built on the native <dialog>: focus trapping and Esc come for free. */
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === ref.current) onClose();
      }}
    >
      {open && (
        <>
          <div className="sheet-head">
            <h2 className="section-title">{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          </div>
          <div className="sheet-body">{children}</div>
        </>
      )}
    </dialog>
  );
}

/**
 * A destructive action that asks once more in place, instead of a browser
 * confirm() box (which some embedded contexts suppress).
 */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  className = 'btn btn-sm btn-danger',
}: {
  label: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(timer);
  }, [armed]);

  if (!armed) {
    return (
      <button type="button" className={className} onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="row" role="group" aria-label="Confirm">
      <button
        type="button"
        className="btn btn-sm btn-danger-solid"
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="btn btn-sm" onClick={() => setArmed(false)}>
        Keep
      </button>
    </span>
  );
}

/**
 * A numeric text input. It keeps what the user is typing ("82." or "82,5")
 * while focused, and only reports valid, non-negative numbers.
 */
export function NumberField({
  id,
  value,
  onCommit,
  className = 'input',
  ariaLabel,
  placeholder,
  max = 100_000,
  decimals = 2,
}: {
  id?: string;
  value: number | null;
  onCommit: (value: number | null) => void;
  className?: string;
  ariaLabel?: string;
  placeholder?: string;
  max?: number;
  decimals?: number;
}) {
  const format = (v: number | null) => (v === null || v === 0 ? '' : formatNumber(v, decimals).replace(/,/g, ''));
  const [text, setText] = useState(() => format(value));
  const [focused, setFocused] = useState(false);
  const [lastValue, setLastValue] = useState(value);

  // Adopt outside changes (another device, a unit switch) unless mid-edit.
  if (value !== lastValue) {
    setLastValue(value);
    if (!focused) setText(format(value));
  }

  return (
    <input
      id={id}
      className={className}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={ariaLabel}
      placeholder={placeholder ?? '0'}
      value={text}
      onFocus={(event) => {
        setFocused(true);
        event.currentTarget.select();
      }}
      onBlur={() => {
        setFocused(false);
        setText(format(value));
      }}
      onChange={(event) => {
        const next = event.target.value;
        if (!/^\d*[.,]?\d*$/.test(next.trim())) return;
        setText(next);
        const parsed = parseNumber(next);
        if (parsed === null) onCommit(null);
        else if (parsed >= 0 && parsed <= max) onCommit(parsed);
      }}
    />
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  format = String,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <output aria-live="polite">{format(value)}</output>
      <button type="button" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
        +
      </button>
    </div>
  );
}

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

const TONE_ICON = { good: 'check', warn: 'alert', bad: 'alert', neutral: null } as const;

/** State is carried by icon and words as well as colour. */
export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  const icon = TONE_ICON[tone];
  return (
    <span className={`pill${tone === 'neutral' ? '' : ` pill-${tone}`}`}>
      {icon && <Icon name={icon} size={13} />}
      {children}
    </span>
  );
}
