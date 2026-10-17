import { Text } from './Typography';
import { useRef, useState, useLayoutEffect } from 'react';
import {
  PanResponder,
  Pressable,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import type { Habit } from '@onpurpose/core/habits';
import { Icon } from './Icon';
import { HabitSymbol } from './HabitSymbol';
import { ReorderRow, type RowMotion } from './ReorderRow';
import { habitInitial } from '@onpurpose/core/gridModes';
import { useTheme } from './ThemeContext';

export type HabitAction =
  'colour' | 'edit' | 'reorder' | 'archive' | 'moveUp' | 'moveDown';
export type HabitAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export function HabitName({
  habit,
  height,
  selected,
  motion,
  reorder,
  compact = false,
  disabled,
  onPress,
  onHold,
  onDrag,
  onDrop,
  onCancel,
  onAction,
  onLayout,
}: {
  habit: Habit;
  height: number;
  selected: boolean;
  motion: RowMotion;
  reorder: boolean;
  /** Compact mode: the icon (or initial) alone; the name stays in labels. */
  compact?: boolean;
  disabled: boolean;
  onPress: () => void;
  onHold: (anchor: HabitAnchor) => void;
  onDrag: (pageY: number, startY: number) => void;
  onDrop: () => void;
  onCancel: () => void;
  onAction: (action: HabitAction) => void;
  onLayout: (event: LayoutChangeEvent) => void;
}) {
  const theme = useTheme();
  const colour = theme.colour(habit.color);
  const view = useRef<View>(null);
  const held = useRef(false);
  const start = useRef(0);
  const callbacks = useRef({ reorder, disabled, onDrag, onDrop, onCancel });
  useLayoutEffect(() => {
    callbacks.current = { reorder, disabled, onDrag, onDrop, onCancel };
  });
  // PanResponder registers handlers; ref reads occur only when native events fire.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () =>
        callbacks.current.reorder && !callbacks.current.disabled,
      onStartShouldSetPanResponder: () =>
        callbacks.current.reorder && !callbacks.current.disabled,
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        held.current &&
        gesture.numberActiveTouches === 1 &&
        Math.abs(gesture.dy) > 10 &&
        Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: (event) => {
        held.current = true;
        if (callbacks.current.reorder || !start.current)
          start.current = event.nativeEvent.pageY;
        callbacks.current.onDrag(
          event.nativeEvent.pageY,
          start.current || event.nativeEvent.pageY,
        );
      },
      onPanResponderMove: (event, gesture) => {
        if (!held.current) return;
        if (gesture.numberActiveTouches !== 1) {
          callbacks.current.onCancel();
          held.current = false;
          return;
        }
        callbacks.current.onDrag(event.nativeEvent.pageY, start.current);
      },
      onPanResponderRelease: () => {
        callbacks.current.onDrop();
        held.current = false;
        start.current = 0;
      },
      onPanResponderTerminate: () => {
        callbacks.current.onCancel();
        held.current = false;
        start.current = 0;
      },
      onPanResponderTerminationRequest: () => !held.current,
    }),
  );
  return (
    <ReorderRow
      motion={motion}
      ref={view}
      collapsable={false}
      {...pan.panHandlers}
      onTouchStart={(event) => {
        if (event.nativeEvent.touches.length !== 1) {
          held.current = false;
          start.current = 0;
          onCancel();
          return;
        }
        // Reset only for a new touch, never when Pressable re-enters its bounds.
        if (!reorder) held.current = false;
        start.current = event.nativeEvent.pageY;
      }}
    >
      <Pressable
        onLayout={onLayout}
        disabled={disabled}
        delayLongPress={380}
        accessibilityRole="button"
        accessibilityLabel={`${habit.name}, details`}
        accessibilityHint="Hold for habit actions, then drag to reorder"
        accessibilityActions={[
          { name: 'activate', label: 'Open notes and statistics' },
          { name: 'edit', label: 'Edit habit' },
          { name: 'colour', label: 'Change colour' },
          { name: 'reorder', label: 'Reorder habits' },
          { name: 'moveUp', label: 'Move up' },
          { name: 'moveDown', label: 'Move down' },
          { name: 'archive', label: 'Archive habit' },
        ]}
        onAccessibilityAction={(event) =>
          event.nativeEvent.actionName === 'activate'
            ? onPress()
            : onAction(event.nativeEvent.actionName as HabitAction)
        }
        onPress={() => {
          if (!held.current && !reorder) onPress();
        }}
        onLongPress={() => {
          held.current = true;
          view.current?.measureInWindow((x, y, width, height) =>
            onHold({ x, y, width, height }),
          );
        }}
        style={({ pressed }) => ({
          minHeight: height,
          paddingVertical: height < 52 ? 4 : 8,
          paddingRight: compact ? 0 : 10,
          borderBottomWidth: 0.5,
          borderBottomColor: `${colour}20`,
          backgroundColor: motion.active
            ? theme.background
            : selected
              ? `${colour}20`
              : pressed
                ? `${colour}15`
                : theme.background,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: compact ? 'center' : 'flex-start',
          gap: 8,
        })}
      >
        {compact ? (
          habit.icon ? (
            <HabitSymbol icon={habit.icon} colour={colour} size={22} />
          ) : (
            <Text
              accessible={false}
              style={{ color: colour, fontSize: 17, fontWeight: '700' }}
            >
              {habitInitial(habit.name)}
            </Text>
          )
        ) : (
          <>
            {reorder && <Icon name="reorder" size={17} color={colour} />}
            <HabitSymbol icon={habit.icon} colour={colour} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={{
                  color: colour,
                  fontSize: 15,
                  lineHeight: 20,
                  fontWeight: '500',
                }}
              >
                {habit.name}
              </Text>
              {habit.unit && (
                <Text
                  style={{
                    color: colour,
                    fontSize: 11,
                    lineHeight: 13,
                    opacity: 0.8,
                  }}
                >
                  {habit.unit}
                </Text>
              )}
            </View>
          </>
        )}
      </Pressable>
    </ReorderRow>
  );
}
