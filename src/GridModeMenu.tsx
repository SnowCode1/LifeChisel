import { useRef, useState, type ComponentType } from 'react';
import {
  Modal,
  Pressable,
  type PressableProps,
  StyleSheet,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import {
  gridModeLabel,
  gridModes,
  type GridMode,
} from '@onpurpose/core/gridModes';
import { Text, useAppWindowDimensions } from './Typography';
import { Icon } from './Icon';
import { appear } from './motion';
import { feedback } from './haptics';
import { useTheme } from './ThemeContext';

const MENU_WIDTH = 236;

// The top bar's left corner: the current view, opening a short list of the
// four. A menu keeps each mode one choice away and always in the same place.
export function GridModeMenu({
  mode,
  sampleData,
  ButtonComponent,
  onChange,
}: {
  mode: GridMode;
  sampleData: boolean;
  /** A Pressable (development builds add the preview hold to it). */
  ButtonComponent: ComponentType<PressableProps>;
  onChange: (mode: GridMode) => void;
}) {
  const theme = useTheme();
  const { width: windowWidth, fontScale } = useAppWindowDimensions();
  const button = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const current = gridModes.find((option) => option.mode === mode)!;
  const open = () => {
    feedback('selection');
    button.current?.measureInWindow((x, y, _width, height) =>
      setAnchor({ x, y: y + height + 4 }),
    );
  };
  const choose = (next: GridMode) => {
    setAnchor(null);
    if (next === mode) return;
    feedback('selection');
    onChange(next);
  };
  const menuWidth = Math.min(
    windowWidth - 16,
    MENU_WIDTH * Math.max(1, fontScale),
  );
  return (
    <>
      <View
        ref={button}
        collapsable={false}
        style={{ alignSelf: 'flex-start' }}
      >
        <ButtonComponent
          accessibilityRole="button"
          accessibilityLabel={`View: ${gridModeLabel(mode)}${sampleData ? ', sample data' : ''}`}
          accessibilityHint="Chooses how habits are shown"
          accessibilityState={{ expanded: !!anchor }}
          onPress={open}
          style={({ pressed }) => ({
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 8,
            marginLeft: -8,
            borderRadius: 12,
            backgroundColor: pressed ? theme.ink(0x17) : 'transparent',
          })}
        >
          <Icon name={current.icon} size={20} color={theme.ink(0xc8)} />
          <View>
            <Text
              numberOfLines={1}
              style={{
                color: theme.ink(0xc8),
                fontSize: 14,
                fontWeight: '600',
              }}
            >
              {current.label}
            </Text>
            {sampleData && (
              <Text
                numberOfLines={1}
                style={{
                  color: theme.ink(0x80),
                  fontSize: 9,
                  fontWeight: '600',
                  letterSpacing: 1,
                }}
              >
                SAMPLE
              </Text>
            )}
          </View>
          <Icon
            name="chevron"
            size={14}
            strokeWidth={2.2}
            color={theme.ink(0x88)}
          />
        </ButtonComponent>
      </View>
      <Modal
        visible={!!anchor}
        transparent
        animationType="none"
        statusBarTranslucent
        supportedOrientations={['portrait', 'landscape']}
        onRequestClose={() => setAnchor(null)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close view menu"
          style={StyleSheet.absoluteFill}
          onPress={() => setAnchor(null)}
        />
        {anchor && (
          <Animated.View
            entering={appear}
            accessibilityViewIsModal
            style={{
              position: 'absolute',
              top: anchor.y,
              left: Math.max(
                8,
                Math.min(anchor.x, windowWidth - menuWidth - 8),
              ),
              width: menuWidth,
              padding: 6,
              borderRadius: 17,
              backgroundColor: theme.ink(0x19),
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.ink(0x2c),
              shadowColor: '#000000',
              shadowOpacity: 0.5,
              shadowRadius: 16,
              elevation: 10,
            }}
          >
            {gridModes.map((option) => {
              const selected = option.mode === mode;
              return (
                <Pressable
                  key={option.mode}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${option.label}, ${option.description}`}
                  onPress={() => choose(option.mode)}
                  style={({ pressed }) => ({
                    minHeight: 48,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 12,
                    backgroundColor: pressed
                      ? theme.ink(0x29)
                      : selected
                        ? theme.ink(0x22)
                        : 'transparent',
                  })}
                >
                  <Icon
                    name={option.icon}
                    size={20}
                    color={selected ? theme.ink(0xf0) : theme.ink(0xb0)}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: theme.ink(0xed),
                        fontSize: 15,
                        fontWeight: selected ? '600' : '500',
                      }}
                    >
                      {option.label}
                    </Text>
                    <Text style={{ color: theme.ink(0x8c), fontSize: 12 }}>
                      {option.description}
                    </Text>
                  </View>
                  {selected && (
                    <Icon name="tick" size={17} color={theme.accent} />
                  )}
                </Pressable>
              );
            })}
          </Animated.View>
        )}
      </Modal>
    </>
  );
}
