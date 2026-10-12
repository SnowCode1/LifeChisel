import Svg, { Circle, Path, Polygon, Rect } from 'react-native-svg';
import { useTheme } from './ThemeContext';

export type IconName =
  | 'history'
  | 'settings'
  | 'close'
  | 'tick'
  | 'chevron'
  | 'checked'
  | 'unchecked'
  | 'number'
  | 'categories'
  | 'text'
  | 'erase'
  | 'palette'
  | 'haptics'
  | 'undo'
  | 'redo'
  | 'edit'
  | 'reorder'
  | 'archive'
  | 'info'
  | 'plus'
  | 'calendar';

// Small, consistent outline icons; no icon font or loading state.
const gear = Array.from({ length: 40 }, (_, index) => {
  const angle = ((index / 40) * 360 - 90) * (Math.PI / 180);
  const radius = index % 5 === 1 || index % 5 === 2 ? 10 : 8;
  return `${12 + Math.cos(angle) * radius},${12 + Math.sin(angle) * radius}`;
}).join(' ');

export function Icon({
  name,
  size = 21,
  color: requested,
  strokeWidth = 1.7,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const theme = useTheme();
  const color = requested ?? theme.ink(0xb8);
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {name === 'history' && (
        <Path d="M3 10a9 9 0 1 1 2.5 8.2M3 4v6h6M12 7v5l3 2" />
      )}
      {name === 'settings' && (
        <>
          <Polygon points={gear} />
          <Circle cx={12} cy={12} r={3.2} />
        </>
      )}
      {name === 'tick' && <Path d="m4 12 5 5L20 6" />}
      {name === 'calendar' && (
        <>
          <Rect x={3.5} y={5} width={17} height={15.5} rx={3} />
          <Path d="M3.5 10h17M8 3v4M16 3v4" />
        </>
      )}
      {name === 'close' && <Path d="m6 6 12 12M18 6 6 18" />}
      {name === 'chevron' && <Path d="m7 9 5 5 5-5" />}
      {(name === 'checked' || name === 'unchecked') && (
        <>
          <Rect x={3.5} y={3.5} width={17} height={17} rx={4} />
          {name === 'checked' && <Path d="m7.5 12 3 3 6-6" />}
        </>
      )}
      {name === 'categories' && (
        <>
          <Rect x={3} y={4} width={7} height={7} rx={2} />
          <Rect x={14} y={4} width={7} height={7} rx={2} />
          <Rect x={3} y={15} width={7} height={5} rx={2} />
          <Path d="M14 17.5h7" />
        </>
      )}
      {name === 'text' && <Path d="M4 5h16M4 10h16M4 15h11M4 20h8" />}
      {name === 'number' && <Path d="M9 3 7 21M17 3l-2 18M4 8h17M3 16h17" />}
      {name === 'erase' && (
        <Path d="m3.5 13 8-9a2 2 0 0 1 2.8-.2l6 5.3a2 2 0 0 1 .2 2.8L14 19H8l-4.3-3.7a1.6 1.6 0 0 1-.2-2.3ZM8 8l10 8M14 19h7" />
      )}
      {name === 'palette' && (
        <>
          <Path d="M21 11a9 9 0 1 0-9 10h1a2 2 0 0 0 1.5-3.3 1.8 1.8 0 0 1 1.3-3H18a3 3 0 0 0 3-3.7Z" />
          <Circle cx={7} cy={10} r={0.7} fill={color} />
          <Circle cx={10} cy={6.5} r={0.7} fill={color} />
          <Circle cx={15} cy={7} r={0.7} fill={color} />
        </>
      )}
      {name === 'haptics' && (
        <>
          <Rect x={8} y={4} width={8} height={16} rx={2} />
          <Path d="M4 8v8M1 10v4M20 8v8M23 10v4M11 17h2" />
        </>
      )}
      {name === 'undo' && <Path d="M9 14l-4-4 4-4M5 10h11a4 4 0 1 1 0 8h-1" />}
      {name === 'redo' && <Path d="m16 4 5 5-5 5M21 9H11a6 6 0 0 0 0 12" />}
      {name === 'edit' && <Path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z" />}
      {name === 'reorder' && <Path d="M5 7h14M5 12h14M5 17h14" />}
      {name === 'archive' && (
        <>
          <Rect x={3} y={4} width={18} height={4} rx={1} />
          <Path d="M5 8v12h14V8M9 12h6" />
        </>
      )}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" />}
      {name === 'info' && (
        <>
          <Circle cx={12} cy={12} r={9} />
          <Path d="M12 11v6" />
          <Circle cx={12} cy={7} r={0.6} fill={color} />
        </>
      )}
    </Svg>
  );
}
