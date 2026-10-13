import { useEffect, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { entryDay } from '@onpurpose/core/calendar';
import { ordinal, timingDate } from '@onpurpose/core/goalTiming';
import { cellAccessibility } from './cellAccessibility';
import { columnX } from './gridGeometry';
import type { CanvasGridProps } from './useCanvasGrid';

// The canvas is one picture to screen readers, so every visible cell and date
// heading also exists as an invisible native element with the role, state,
// label and activation the native grid had. These elements stay mounted for
// Switch Control and scripted checks; they take touches only while a screen
// reader runs, leaving the canvas gestures to everyone else.
function useScreenReader() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((value) => {
      if (active) setEnabled(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      setEnabled,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return enabled;
}

function useFollowOffset(props: CanvasGridProps) {
  const settled = props.rightmostDay * props.column;
  const offset = props.offset;
  return useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value - settled }],
  }));
}

function visibleDays(props: CanvasGridProps) {
  return Array.from(
    { length: Math.max(0, props.visibleDays) },
    (_, index) => props.rightmostDay + index,
  );
}

export function GridAccessibilityLayer(
  props: CanvasGridProps & { onActivate: (id: string, day: number) => void },
) {
  const {
    store,
    rows,
    tops,
    heights,
    baseHeight,
    column,
    width,
    rightmostDay,
    today,
    disabled,
    onActivate,
  } = props;
  const screenReader = useScreenReader();
  const values = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().replay.state.values,
  );
  const follow = useFollowOffset(props);
  const todayOrdinal = ordinal(today);
  return (
    <Animated.View
      pointerEvents={screenReader ? 'box-none' : 'none'}
      style={[StyleSheet.absoluteFill, follow]}
    >
      {visibleDays(props).map((day) => {
        const date = timingDate(todayOrdinal - day);
        const { fullLabel } = entryDay(date);
        const left = columnX(day, width, rightmostDay * column, column);
        return rows.map((habit) => {
          const a = cellAccessibility(
            habit,
            values[`${habit.id}:${date}`],
            date,
            fullLabel,
          );
          const activate = () => {
            if (!disabled) onActivate(habit.id, day);
          };
          return (
            <View
              key={`${habit.id}:${date}`}
              accessible
              testID={`cell-${habit.id}-${date}`}
              accessibilityRole={a.role}
              accessibilityState={
                a.role === 'checkbox'
                  ? { checked: a.checked, disabled }
                  : { disabled }
              }
              accessibilityLabel={a.label}
              accessibilityHint={a.hint}
              accessibilityActions={[{ name: 'activate', label: a.hint }]}
              onAccessibilityTap={activate}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === 'activate') activate();
              }}
              style={{
                position: 'absolute',
                left,
                top: tops[habit.id] ?? 0,
                width: column,
                height: heights[habit.id] ?? baseHeight,
              }}
            />
          );
        });
      })}
    </Animated.View>
  );
}

/** Date headings plus an adjustable strip that pages through dates. */
export function HeadingAccessibility(props: CanvasGridProps) {
  const {
    column,
    width,
    headerHeight,
    rightmostDay,
    visibleDays: count,
    unlockedFuture,
    today,
    onNavigate,
  } = props;
  const screenReader = useScreenReader();
  const follow = useFollowOffset(props);
  const todayOrdinal = ordinal(today);
  const days = visibleDays(props);
  const label = (day: number) =>
    entryDay(timingDate(todayOrdinal - day)).fullLabel;
  return (
    <View
      pointerEvents={screenReader ? 'box-none' : 'none'}
      style={StyleSheet.absoluteFill}
    >
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Dates"
        accessibilityHint="Swipe up for later dates, down for earlier dates"
        accessibilityValue={
          days.length
            ? { text: `${label(days.at(-1)!)} to ${label(days[0])}` }
            : undefined
        }
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'increment')
            onNavigate(Math.max(-unlockedFuture, rightmostDay - count));
          else if (event.nativeEvent.actionName === 'decrement')
            onNavigate(rightmostDay + count);
        }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, follow]}
      >
        {days.map((day) => (
          <View
            key={day}
            accessible
            accessibilityRole="header"
            accessibilityLabel={label(day)}
            style={{
              position: 'absolute',
              left: columnX(day, width, rightmostDay * column, column),
              top: 0,
              width: column,
              height: headerHeight,
            }}
          />
        ))}
      </Animated.View>
    </View>
  );
}
