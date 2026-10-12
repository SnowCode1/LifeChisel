import { memo, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import type { Habit } from './habits';
import type { GridDay } from './calendar';
import type { CheckboxStyle } from './displayPreferences';
import type { ChangeStore } from './storage/store';
import { entrySelection } from './storage/selection';
import { checkboxChecked, evaluateGoal } from './habitGoals';
import type { GridPalette } from './gridAppearance';
import { performanceEnabled, timePerformance } from './performance';

export const CheckboxGraphic = memo(function CheckboxGraphic({
  store,
  habit,
  day,
  palette,
  size,
  style,
  x,
  y,
  hidden,
  noGoalTint,
}: {
  store: ChangeStore;
  habit: Habit;
  day: GridDay;
  palette: GridPalette;
  size: number;
  style: CheckboxStyle;
  x: number;
  y: number;
  hidden: boolean;
  noGoalTint: boolean;
}) {
  const selection = useMemo(
    () => entrySelection(store, `${habit.id}:${day.key}`),
    [store, habit.id, day.key],
  );
  const value = useSyncExternalStore(
    selection.subscribe,
    selection.getSnapshot,
  );
  if (hidden) return null;
  const checked = performanceEnabled
    ? timePerformance('grid.checkbox.policy', () =>
        checkboxChecked(habit, value, day.key),
      )
    : checkboxChecked(habit, value, day.key);
  const met =
    !noGoalTint &&
    (performanceEnabled
      ? timePerformance(
          'grid.goal',
          () => evaluateGoal(habit, value, day.key).met,
        )
      : evaluateGoal(habit, value, day.key).met);
  const colour = met ? palette.colour : palette.checkbox;
  const box = size * (22 / 28),
    stroke = Math.max(1.25, box * (1.5 / 22));
  const glyph = style === 'marks' ? size : box * 0.85;
  return (
    <>
      {style === 'boxes' && (
        <Rect
          x={x - box / 2 + stroke / 2}
          y={y - box / 2 + stroke / 2}
          width={Math.max(0, box - stroke)}
          height={Math.max(0, box - stroke)}
          rx={Math.max(0, box * (6 / 22) - stroke / 2)}
          fill={checked ? colour : 'none'}
          stroke={colour}
          strokeWidth={stroke}
        />
      )}
      {(checked || style === 'marks') && (
        <Path
          transform={`translate(${x - glyph / 2} ${y - glyph / 2}) scale(${glyph / 24})`}
          d={checked ? 'm4 12 5 5L20 6' : 'm6 6 12 12M18 6 6 18'}
          fill="none"
          stroke={style === 'boxes' ? palette.checkmark : colour}
          strokeWidth={style === 'boxes' ? 2.5 : checked ? 2.3 : 1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </>
  );
});

export function GridCheckboxLayer({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: ReactNode;
}) {
  return (
    <Svg
      width={width}
      height={height}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }}
    >
      {children}
    </Svg>
  );
}
