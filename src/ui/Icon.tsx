/**
 * Chunky 24×24 stroke icons with round caps, matching the heavy outlines used
 * across the UI. Paths prefixed with "fill:" are filled instead of stroked.
 */
const ICONS = {
  settings: [
    'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
    'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  ],
  x: ['M6 6l12 12', 'M18 6L6 18'],
  backspace: ['M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7 6-7z', 'M12 9l6 6', 'M18 9l-6 6'],
  left: ['M15 5l-7 7 7 7'],
  right: ['M9 5l7 7-7 7'],
  swap: ['M7 4v16', 'M3 8l4-4 4 4', 'M17 20V4', 'M21 16l-4 4-4-4'],
  refresh: ['M20 11a8 8 0 0 0-14.8-4.2L4 8', 'M4 4v4h4', 'M4 13a8 8 0 0 0 14.8 4.2L20 16', 'M20 20v-4h-4'],
  plus: ['M12 5v14', 'M5 12h14'],
  arrowRight: ['M5 12h14', 'M13 6l6 6-6 6'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  vars: ['M4 7c4 0 4 10 8 10', 'M4 17c4 0 6-10 10-10', 'M16 10l5 6', 'M21 10l-5 6'],
  sparkle: ['M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, stroke = 2.2 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name].map((d) =>
        d.startsWith('fill:') ? (
          <path key={d} d={d.slice(5)} fill="currentColor" stroke="none" />
        ) : (
          <path key={d} d={d} />
        ),
      )}
    </svg>
  );
}
