import type { IconName } from '@onpurpose/core/iconNames';

// The phone's small outline icons, drawn the same way for the web.
const gear = Array.from({ length: 40 }, (_, index) => {
  const angle = ((index / 40) * 360 - 90) * (Math.PI / 180);
  const radius = index % 5 === 1 || index % 5 === 2 ? 10 : 8;
  return `${12 + Math.cos(angle) * radius},${12 + Math.sin(angle) * radius}`;
}).join(' ');

export function Icon({
  name,
  size = 20,
  color = 'currentColor',
  strokeWidth = 1.7,
}: {
  name: IconName;
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
      {name === 'plus' && <path d="M12 5v14M5 12h14" />}
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
