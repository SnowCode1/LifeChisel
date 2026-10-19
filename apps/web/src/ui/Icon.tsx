import type { IconName } from '@onpurpose/core/iconNames';

// The phone's small outline icons, drawn the same way for the web.
const gear = Array.from({ length: 40 }, (_, index) => {
  const angle = ((index / 40) * 360 - 90) * (Math.PI / 180);
  const radius = index % 5 === 1 || index % 5 === 2 ? 10 : 8;
  return `${12 + Math.cos(angle) * radius},${12 + Math.sin(angle) * radius}`;
}).join(' ');

// Web-only icons (the sidebar and its controls) beside the shared ones.
export type WebIconName =
  | IconName
  | 'grid'
  | 'keyboard'
  | 'sidebar'
  | 'device'
  | 'flask'
  | 'expand'
  | 'cloud';

export function Icon({
  name,
  size = 20,
  color = 'currentColor',
  strokeWidth = 1.7,
}: {
  name: WebIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'history' && (
        <path d="M3 10a9 9 0 1 1 2.5 8.2M3 4v6h6M12 7v5l3 2" />
      )}
      {name === 'settings' && (
        <>
          <polygon points={gear} />
          <circle cx={12} cy={12} r={3.2} />
        </>
      )}
      {name === 'tick' && <path d="m4 12 5 5L20 6" />}
      {name === 'calendar' && (
        <>
          <rect x={3.5} y={5} width={17} height={15.5} rx={3} />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </>
      )}
      {name === 'close' && <path d="m6 6 12 12M18 6 6 18" />}
      {name === 'chevron' && <path d="m7 9 5 5 5-5" />}
      {(name === 'checked' || name === 'unchecked') && (
        <>
          <rect x={3.5} y={3.5} width={17} height={17} rx={4} />
          {name === 'checked' && <path d="m7.5 12 3 3 6-6" />}
        </>
      )}
      {name === 'categories' && (
        <>
          <rect x={3} y={4} width={7} height={7} rx={2} />
          <rect x={14} y={4} width={7} height={7} rx={2} />
          <rect x={3} y={15} width={7} height={5} rx={2} />
          <path d="M14 17.5h7" />
        </>
      )}
      {name === 'text' && <path d="M4 5h16M4 10h16M4 15h11M4 20h8" />}
      {name === 'stats' && <path d="M4 20h16M7 16v-4M12 16V6M17 16v-7" />}
      {name === 'number' && <path d="M9 3 7 21M17 3l-2 18M4 8h17M3 16h17" />}
      {name === 'erase' && (
        <path d="m3.5 13 8-9a2 2 0 0 1 2.8-.2l6 5.3a2 2 0 0 1 .2 2.8L14 19H8l-4.3-3.7a1.6 1.6 0 0 1-.2-2.3ZM8 8l10 8M14 19h7" />
      )}
      {name === 'palette' && (
        <>
          <path d="M21 11a9 9 0 1 0-9 10h1a2 2 0 0 0 1.5-3.3 1.8 1.8 0 0 1 1.3-3H18a3 3 0 0 0 3-3.7Z" />
          <circle cx={7} cy={10} r={0.7} fill={color} />
          <circle cx={10} cy={6.5} r={0.7} fill={color} />
          <circle cx={15} cy={7} r={0.7} fill={color} />
        </>
      )}
      {name === 'haptics' && (
        <>
          <rect x={8} y={4} width={8} height={16} rx={2} />
          <path d="M4 8v8M1 10v4M20 8v8M23 10v4M11 17h2" />
        </>
      )}
      {name === 'undo' && <path d="M9 14l-4-4 4-4M5 10h11a4 4 0 1 1 0 8h-1" />}
      {name === 'redo' && <path d="m16 4 5 5-5 5M21 9H11a6 6 0 0 0 0 12" />}
      {name === 'edit' && <path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z" />}
      {name === 'reorder' && <path d="M5 7h14M5 12h14M5 17h14" />}
      {name === 'archive' && (
        <>
          <rect x={3} y={4} width={18} height={4} rx={1} />
          <path d="M5 8v12h14V8M9 12h6" />
        </>
      )}
      {name === 'modeGrid' && (
        <>
          <rect x={3.5} y={4.5} width={17} height={15} rx={2.5} />
          <path d="M9.5 4.5v15M13.2 9.5v10M16.9 9.5v10M3.5 9.5h17M3.5 14.5h17" />
        </>
      )}
      {name === 'modeCompact' && (
        <>
          <rect x={3.5} y={4.5} width={17} height={15} rx={2.5} />
          <path d="M7.5 4.5v15M10.75 9.5v10M14 9.5v10M17.25 9.5v10M3.5 9.5h17M3.5 14.5h17" />
        </>
      )}
      {name === 'modeToday' && (
        <>
          <rect x={3.5} y={3.5} width={7.5} height={7.5} rx={2} />
          <rect x={13} y={3.5} width={7.5} height={7.5} rx={2} />
          <rect x={3.5} y={13} width={7.5} height={7.5} rx={2} />
          <rect x={13} y={13} width={7.5} height={7.5} rx={2} />
        </>
      )}
      {name === 'modeWeeks' && (
        <>
          <rect x={3.5} y={4.5} width={17} height={15} rx={2.5} />
          <path d="M9.5 4.5v15M15 9.5v10M3.5 9.5h17" />
          <path d="M11.5 14.5h1.5M16.8 14.5h1.5" />
        </>
      )}
      {name === 'plus' && <path d="M12 5v14M5 12h14" />}
      {name === 'grid' && (
        <>
          <rect x={3.5} y={4} width={17} height={16} rx={3} />
          <path d="M3.5 9.5h17M9 9.5V20M3.5 15h17" />
        </>
      )}
      {name === 'keyboard' && (
        <>
          <rect x={2.5} y={6} width={19} height={12} rx={2.5} />
          <path d="M6.5 10h1M10.5 10h1M14.5 10h1M8 14h8" />
        </>
      )}
      {name === 'sidebar' && (
        <>
          <rect x={3.5} y={4.5} width={17} height={15} rx={3} />
          <path d="M9.5 4.5v15" />
        </>
      )}
      {name === 'device' && (
        <>
          <ellipse cx={12} cy={6} rx={7.5} ry={2.5} />
          <path d="M4.5 6v12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5V6M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5" />
        </>
      )}
      {name === 'cloud' && (
        <path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.5 9.6 4.5 4.5 0 0 0 7 18.5Z" />
      )}
      {name === 'expand' && (
        <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
      )}
      {name === 'flask' && (
        <path d="M9.5 3.5h5M10.5 3.5v6L5 18.5A1.6 1.6 0 0 0 6.4 21h11.2a1.6 1.6 0 0 0 1.4-2.5l-5.5-9v-6M7.5 15h9" />
      )}
      {name === 'info' && (
        <>
          <circle cx={12} cy={12} r={9} />
          <path d="M12 11v6" />
          <circle cx={12} cy={7} r={0.6} fill={color} />
        </>
      )}
    </svg>
  );
}
