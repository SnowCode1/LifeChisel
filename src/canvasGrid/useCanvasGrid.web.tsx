import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import type { CanvasGridProps } from './useCanvasGrid';

// The canvas grid is phone-only (Skia on the web would need CanvasKit and
// bundled fonts). The web preview keeps the rest of the screen usable.
export function useCanvasGrid(props: CanvasGridProps): {
  header: ReactNode;
  body: ReactNode;
} {
  return {
    header: <View style={{ width: props.width, height: props.headerHeight }} />,
    body: (
      <View style={{ width: props.width, padding: 12 }}>
        <Text style={{ color: props.theme.ink(0x88), fontSize: 13 }}>
          The habit grid runs on phones.
        </Text>
      </View>
    ),
  };
}
