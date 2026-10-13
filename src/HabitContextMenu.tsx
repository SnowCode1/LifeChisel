import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text } from './Typography';
import { Icon } from './Icon';
import { appear, disappear, menuAppear } from './motion';
import type { Habit } from '@onpurpose/core/habits';
import type { HabitAction, HabitAnchor } from './HabitName';
import { useTheme } from './ThemeContext';

// Own measurement here so laying out the menu cannot rerender date columns.
// Stay mounted while closed to retain the last measured height. The selected
// name remains uncovered so the original hold or a second hold can start a drag.
export function HabitContextMenu({
  menu,
  habit,
  bounds,
  width,
  nameWidth,
  onClose,
  onAction,
}: {
  menu: { anchor: HabitAnchor } | null;
  habit: Habit | undefined;
  bounds: { rootY: number; rootHeight: number };
  width: number;
  nameWidth: number;
  onClose: () => void;
  onAction: (action: HabitAction) => void;
}) {
  const [menuHeight, setMenuHeight] = useState(250);
  const theme = useTheme();
  if (!menu || !habit) return null;
  return (
    <Animated.View
      entering={appear}
      exiting={disappear}
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
      accessibilityViewIsModal
    >
      {/* Leave the selected name reachable: a second hold can start a drag,
              and the original held touch is never covered by a new hit target. */}
      {[
        {
          top: 0,
          left: 0,
          right: 0,
          height: Math.max(0, menu.anchor.y - bounds.rootY),
        },
        {
          top: Math.max(0, menu.anchor.y - bounds.rootY + menu.anchor.height),
          left: 0,
          right: 0,
          bottom: 0,
        },
        {
          top: Math.max(0, menu.anchor.y - bounds.rootY),
          left: nameWidth,
          right: 0,
          height: menu.anchor.height,
        },
      ].map((frame, index) => (
        <Pressable
          key={index}
          accessible={index === 0}
          accessibilityRole="button"
          accessibilityLabel="Dismiss habit actions"
          onPress={onClose}
          style={[{ position: 'absolute' }, frame]}
        />
      ))}
      <Animated.View
        entering={menuAppear}
        onLayout={(event) => setMenuHeight(event.nativeEvent.layout.height)}
        style={{
          position: 'absolute',
          left: Math.max(0, Math.min(nameWidth - 12, width - 224)),
          top: Math.max(
            52,
            Math.min(
              menu.anchor.y - bounds.rootY + menu.anchor.height + 4,
              bounds.rootHeight - menuHeight - 8,
            ),
          ),
          width: 224,
          maxHeight: '85%',
          borderRadius: 17,
          backgroundColor: theme.ink(0x19),
          borderWidth: 1,
          borderColor: theme.ink(0x33),
          shadowColor: '#000000',
          shadowOpacity: 0.5,
          shadowRadius: 16,
          elevation: 10,
          overflow: 'hidden',
        }}
      >
        <ScrollView>
          <Text
            style={{
              paddingHorizontal: 16,
              paddingTop: 14,
              paddingBottom: 8,
              color: theme.colour(habit.color),
              fontSize: 13,
              fontWeight: '600',
            }}
          >
            {habit.name}
          </Text>
          {(
            [
              ['colour', 'Colour', 'palette'],
              ['edit', 'Edit habit', 'edit'],
              ['reorder', 'Reorder', 'reorder'],
              ['archive', 'Archive', 'archive'],
            ] as const
          ).map(([action, label, icon]) => (
            <Pressable
              key={action}
              accessibilityRole="button"
              onPress={() => {
                onClose();
                onAction(action);
              }}
              style={({ pressed }) => ({
                minHeight: 46,
                paddingHorizontal: 16,
                paddingVertical: 11,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                backgroundColor: pressed ? theme.ink(0x29) : 'transparent',
              })}
            >
              <Icon name={icon} size={18} />
              <Text style={{ color: theme.ink(0xdd), fontSize: 15, flex: 1 }}>
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
}
