import { Text } from './Typography';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { HabitIcon } from '@onpurpose/core/habitIcons';
import { normalizeHex } from '@onpurpose/core/colors';
import { useTheme } from './ThemeContext';
import { phosphorPaths } from '@onpurpose/core/phosphorPaths';
import { tablerPaths } from '@onpurpose/core/tablerPaths';

// Decorative beside the habit name, whose accessible label remains authoritative.
export function HabitSymbol({
  icon,
  colour: requested,
  size = 20,
}: {
  icon?: HabitIcon;
  colour: string;
  size?: number;
}) {
  const theme = useTheme();
  if (!icon) return null;
  // Readable on any background; idempotent for display colours from callers.
  const colour = normalizeHex(requested) ? theme.colour(requested) : requested;
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {icon.startsWith('emoji:') ? (
        <Text
          allowFontScaling={false}
          style={{ fontSize: size * 0.9, lineHeight: size * 1.15 }}
        >
          {icon.slice(6)}
        </Text>
      ) : icon.startsWith('tabler:') ? (
        <Svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={colour}
          color={colour}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          accessible={false}
        >
          {tablerPaths[icon.slice(7)]?.map((path, index) => (
            <Path
              key={index}
              {...path}
              fill={path.fill === 'currentColor' ? colour : 'none'}
            />
          ))}
        </Svg>
      ) : (
        <Svg
          width={size}
          height={size}
          viewBox="0 0 256 256"
          fill={colour}
          accessible={false}
        >
          {phosphorPaths[icon.slice(9)]?.map((d, index) => (
            <Path key={index} d={d} />
          ))}
        </Svg>
      )}
    </View>
  );
}
