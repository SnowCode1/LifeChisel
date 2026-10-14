import type { HabitIcon } from '@onpurpose/core/habitIcons';
import { phosphorPaths } from '@onpurpose/core/phosphorPaths';
import { tablerPaths } from '@onpurpose/core/tablerPaths';

// Decorative beside a habit's name, whose text label stays authoritative.
// Same icon packs and drawing as the phone's HabitSymbol.
export function HabitSymbol({
  icon,
  colour,
  size = 20,
}: {
  icon?: HabitIcon;
  colour: string;
  size?: number;
}) {
  if (!icon) return null;
  if (icon.startsWith('emoji:'))
    return (
      <span
        className="habit-symbol"
        aria-hidden="true"
        style={{ width: size, height: size, fontSize: size * 0.9 }}
      >
        {icon.slice(6)}
      </span>
    );
  if (icon.startsWith('tabler:'))
    return (
      <svg
        className="habit-symbol"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={colour}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {tablerPaths[icon.slice(7)]?.map((path, index) => (
          <path
            key={index}
            d={path.d}
            opacity={path.opacity}
            stroke={path.stroke === 'none' ? 'none' : undefined}
            fill={path.fill === 'currentColor' ? colour : 'none'}
          />
        ))}
      </svg>
    );
  return (
    <svg
      className="habit-symbol"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill={colour}
      aria-hidden="true"
    >
      {phosphorPaths[icon.slice(9)]?.map((d, index) => (
        <path key={index} d={d} />
      ))}
    </svg>
  );
}
