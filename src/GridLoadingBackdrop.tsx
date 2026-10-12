import type { WeekStart } from './displayPreferences';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import type { Habit } from './habits';
import type { GridDay } from './calendar';
import { GridDateLabel } from './GridCells';
import { ReorderRow, type RowMotion } from './ReorderRow';
import { loadingStripOffset, loadingEdgeMasks } from './gridLoading';
import { useTheme } from './ThemeContext';

// These dates are cheap, read-only native text. They are prepared with each date
// range, so a virtualized-list spacer never hides the calendar during a JS stall.
const FallbackDate = memo(function FallbackDate({
  weekStart,
  weekDividers,
  day,
  index,
  width,
}: {
  weekStart: WeekStart;
  weekDividers: boolean;
  day: GridDay;
  index: number;
  width: number;
}) {
  return (
    <View
      style={{
        position: 'absolute',
        right: index * width,
        top: 0,
        bottom: 0,
        width,
      }}
    >
      <GridDateLabel
        day={day}
        width={width}
        weekDividers={weekDividers}
        weekStart={weekStart}
      />
    </View>
  );
});
export const GridDateBackdrop = memo(function GridDateBackdrop({
  weekStart,
  weekDividers,
  days,
  width,
  offset,
}: {
  weekStart: WeekStart;
  weekDividers: boolean;
  days: GridDay[];
  width: number;
  offset: SharedValue<number>;
}) {
  const movement = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.clip}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: days.length * width,
          },
          movement,
        ]}
      >
        {days.map((day, index) => (
          <FallbackDate
            weekDividers={weekDividers}
            weekStart={weekStart}
            key={day.key}
            day={day}
            index={index}
            width={width}
          />
        ))}
      </Animated.View>
    </View>
  );
});

// A bounded, native-painted dash pattern sits behind the real columns. It never
// pretends that a saved checkbox is empty and never accepts entry taps.
export const GridLoadingBackdrop = memo(function GridLoadingBackdrop({
  habits,
  motions,
  heights,
  baseHeight,
  columnWidth,
  viewportWidth,
  maximumOffset,
  offset,
}: {
  habits: Habit[];
  motions: Record<string, RowMotion>;
  heights: Record<string, number>;
  baseHeight: number;
  columnWidth: number;
  viewportWidth: number;
  maximumOffset: number;
  offset: SharedValue<number>;
}) {
  const movement = useAnimatedStyle(() => ({
    transform: [{ translateX: loadingStripOffset(offset.value, columnWidth) }],
  }));
  const rightEdge = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: loadingEdgeMasks(offset.value, maximumOffset, viewportWidth)
          .right,
      },
    ],
  }));
  const leftEdge = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: loadingEdgeMasks(offset.value, maximumOffset, viewportWidth)
          .left,
      },
    ],
  }));
  const theme = useTheme();
  const stripWidth = viewportWidth + columnWidth * 2;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.clip}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: stripWidth,
          },
          movement,
        ]}
      >
        {habits.map((habit, index) => {
          const height = heights[habit.id] ?? baseHeight;
          const colour = theme.colour(habit.color);
          const pattern = `loading-row-${index}`;
          return (
            <ReorderRow key={habit.id} motion={motions[habit.id]}>
              <Svg width={stripWidth} height={height} accessible={false}>
                <Defs>
                  <Pattern
                    id={pattern}
                    width={columnWidth}
                    height={height}
                    patternUnits="userSpaceOnUse"
                  >
                    <Line
                      x1={columnWidth / 2 - 5}
                      x2={columnWidth / 2 + 5}
                      y1={height / 2}
                      y2={height / 2}
                      stroke={colour}
                      strokeOpacity={0.25}
                      strokeWidth={2}
                      strokeLinecap="round"
                    />
                  </Pattern>
                </Defs>
                <Rect
                  width={stripWidth}
                  height={height}
                  fill={`url(#${pattern})`}
                />
                <Line
                  x1={0}
                  x2={stripWidth}
                  y1={height - 0.5}
                  y2={height - 0.5}
                  stroke={colour}
                  strokeOpacity={0.08}
                  strokeWidth={StyleSheet.hairlineWidth}
                />
              </Svg>
            </ReorderRow>
          );
        })}
      </Animated.View>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: viewportWidth,
            width: viewportWidth,
            backgroundColor: theme.background,
          },
          rightEdge,
        ]}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: -viewportWidth,
            width: viewportWidth,
            backgroundColor: theme.background,
          },
          leftEdge,
        ]}
      />
    </View>
  );
});
const styles = StyleSheet.create({
  clip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
});
