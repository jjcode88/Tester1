import type { ReactNode } from 'react';

const PATHS = {
  today: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M10 20v-6h4v6" />
    </>
  ),
  history: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="3.5" cy="6" r="1" />
      <circle cx="3.5" cy="12" r="1" />
      <circle cx="3.5" cy="18" r="1" />
    </>
  ),
  progress: (
    <>
      <path d="M3 3v18h18" />
      <path d="m7 15 4-5 3 3 5-7" />
    </>
  ),
  tools: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 7h8M8 12h2M12 12h0M16 12h0M8 16h2M12 16h0M16 16h0" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </>
  ),
  status: <path d="M2 12h4l3-8 4 16 3-8h6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  trash: (
    <>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 13h10l1-13M9 7V4h6v3" />
    </>
  ),
  play: <path d="M7 4.5v15l12-7.5z" />,
  repeat: (
    <>
      <path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5" />
      <path d="M20 4v4.5h-4.5" />
      <path d="M20 12a8 8 0 0 1-13.7 5.7L4 15.5" />
      <path d="M4 20v-4.5h4.5" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  cloud: <path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 10.5a3.75 3.75 0 0 1-.5 7.5z" />,
  device: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2.5 20h19z" />
      <path d="M12 10v4M12 17h0" />
    </>
  ),
  sync: (
    <>
      <path d="M20 12a8 8 0 0 0-14-5.3L4 8.5" />
      <path d="M4 4v4.5h4.5" />
      <path d="M4 12a8 8 0 0 0 14 5.3l2-1.8" />
      <path d="M20 20v-4.5h-4.5" />
    </>
  ),
  medal: (
    <>
      <circle cx="12" cy="14" r="6" />
      <path d="M8.5 9 6 3h4l2 4 2-4h4l-2.5 6" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** The mark: a loaded barbell seen end-on, three plates deep. */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true" focusable="false">
      <rect x="1" y="11.5" width="24" height="3" rx="1.5" fill="var(--steel)" />
      <rect x="4" y="4" width="4" height="18" rx="1.5" fill="var(--plate-blue)" />
      <rect x="9" y="6.5" width="3" height="13" rx="1.2" fill="var(--plate-yellow)" />
      <rect x="14" y="6.5" width="3" height="13" rx="1.2" fill="var(--plate-yellow)" />
      <rect x="18" y="4" width="4" height="18" rx="1.5" fill="var(--plate-blue)" />
    </svg>
  );
}
