import { cellEntryLabel, entryLabel } from './entries';
import { evaluateGoal, checkboxChecked } from './habitGoals';
import { GridCheckboxMark, type CheckboxFeedback } from './GridCheckboxMark';
import {
  isShadedWeek,
  type WeekStart,
  type CheckboxStyle,
} from './displayPreferences';
import { Text } from './Typography';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewProps,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useGridColumnPress } from './useGridColumnPress';
import { CheckboxGraphic, GridCheckboxLayer } from './GridCheckboxLayer';
import type { GridDay } from './calendar';
import { habitType, isNumericHabit, type Habit } from './habits';
import { ReorderRow, type RowMotion } from './ReorderRow';
import { dateTone, type GridPalette } from './gridAppearance';
import { themedStyles, useTheme } from './ThemeContext';
import { entrySelection } from './storage/selection';
import type { ChangeStore } from './storage/store';
import {
  performanceEnabled,
  recordPerformance,
  timePerformance,
} from './performance';
import type { GridExperiment } from './performanceModel';
import {
  GRID_ENTRY_FONT_SIZE,
  GRID_ENTRY_LINE_HEIGHT,
  gridEntryTextLines,
} from './gridEntryText';

type CellProps = {
  store: ChangeStore;
  habit: Habit;
  day: GridDay;
  palette: GridPalette;
  motion: RowMotion;
  height: number;
  width: number;
  checkboxStyle: CheckboxStyle;
  tapAnimations: boolean;
  fontScale: number;
  disabled: boolean;
  onPress: (habit: Habit, day: GridDay) => void;
  experiment?: GridExperiment;
  nativeControl?: boolean;
  pressed?: boolean;
  drawCheckbox?: boolean;
  onFeedback?: (habit: Habit) => void;
  animatedPosition?: boolean;
};
const GridCell = memo(function GridCell({
  store,
  habit,
  day,
  palette,
  motion,
  height,
  width,
  checkboxStyle,
  tapAnimations,
  fontScale,
  disabled,
  onPress,
  experiment = 'normal',
  nativeControl = false,
  pressed = false,
  drawCheckbox = true,
  onFeedback,
  animatedPosition = true,
}: CellProps) {
  const mark = useRef<CheckboxFeedback>(null);
  const selection = useMemo(
    () => entrySelection(store, `${habit.id}:${day.key}`),
    [store, habit.id, day.key],
  );
  const value = useSyncExternalStore(
    selection.subscribe,
    selection.getSnapshot,
  );
  recordPerformance('grid.cell.render');
  useEffect(() => {
    if (!performanceEnabled) return;
    recordPerformance('grid.cell.mount');
    return () => recordPerformance('grid.cell.unmount');
  }, []);
  const numeric = isNumericHabit(habit);
  const checkbox = habitType(habit) === 'checkbox';
  const checked =
    checkbox &&
    (performanceEnabled
      ? timePerformance('grid.checkbox.policy', () =>
          checkboxChecked(habit, value, day.key),
        )
      : checkboxChecked(habit, value, day.key));
  const recorded = value !== undefined;
  const goal =
    experiment === 'no-goal-tint'
      ? { active: false, met: false, scheduled: true }
      : performanceEnabled
        ? timePerformance('grid.goal', () =>
            evaluateGoal(habit, value, day.key),
          )
        : evaluateGoal(habit, value, day.key);
  const Row = experiment === 'simple-cells' ? StaticCellRow : ReorderRow;
  const activate = () => {
    if (disabled) return;
    const previous =
      store.getSnapshot().replay.state.values[`${habit.id}:${day.key}`];
    onPress(habit, day);
    const next =
      store.getSnapshot().replay.state.values[`${habit.id}:${day.key}`];
    if (
      checkbox &&
      experiment !== 'simple-cells' &&
      tapAnimations &&
      checkboxChecked(habit, next, day.key) !==
        checkboxChecked(habit, previous, day.key)
    ) {
      if (onFeedback) onFeedback(habit);
      else mark.current?.pulse();
    }
  };
  const controls = {
    accessible: true,
    testID: `cell-${habit.id}-${day.key}`,
    accessibilityRole: checkbox ? ('checkbox' as const) : ('button' as const),
    accessibilityState: checkbox ? { checked, disabled } : { disabled },
    accessibilityLabel: `${habit.name}, ${day.fullLabel}${checkbox ? '' : `, ${value === undefined ? 'not recorded' : entryLabel(habit, value) + (habit.unit ? ` ${habit.unit}` : '')}`}, ${goal.active ? (goal.met ? 'goal met' : recorded ? 'goal not met' : 'not recorded') : 'tracking only'}${goal.active && !goal.scheduled ? ', not scheduled' : ''}`,
    accessibilityHint: checkbox
      ? 'Toggle this day’s checkbox state'
      : numeric
        ? 'Edit this day’s total'
        : habit.type === 'categorical'
          ? 'Choose categories for this day'
          : 'Read or edit this day’s text',
  };
  const cellStyle = (pressed: boolean) => [
    styles.cell,
    {
      height,
      borderBottomColor: palette.rule,
      backgroundColor: pressed
        ? palette.pressed
        : goal.met
          ? palette.completedBackground
          : day.daysAgo === 0
            ? palette.todayBackground
            : palette.background,
    },
  ];
  const content = !checkbox ? (
    <Text
      numberOfLines={numeric ? 1 : gridEntryTextLines(height, fontScale)}
      adjustsFontSizeToFit={numeric}
      minimumFontScale={numeric ? 0.65 : undefined}
      ellipsizeMode="tail"
      style={[
        numeric ? styles.numeric : styles.textEntry,
        { color: recorded ? palette.colour : palette.number },
      ]}
    >
      {cellEntryLabel(habit, value)}
    </Text>
  ) : experiment === 'simple-cells' ? (
    <Text
      style={{
        fontSize: 22 * fontScale,
        color: goal.met ? palette.colour : palette.checkbox,
      }}
    >
      {checked ? '✓' : '□'}
    </Text>
  ) : drawCheckbox ? (
    <GridCheckboxMark
      ref={mark}
      identity={`${habit.id}:${day.key}`}
      checked={checked}
      style={checkboxStyle}
      checkmark={palette.checkmark}
      size={Math.max(0, Math.min(28 * fontScale, height - 16, width - 16))}
      colour={goal.met ? palette.colour : palette.checkbox}
    />
  ) : null;
  if (nativeControl)
    return (
      <Row
        motion={motion}
        {...(experiment === 'simple-cells' ? {} : { animatedPosition })}
        {...controls}
        style={cellStyle(pressed)}
        accessibilityActions={[
          { name: 'activate', label: controls.accessibilityHint },
        ]}
        onAccessibilityTap={activate}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'activate') activate();
        }}
      >
        {content}
      </Row>
    );
  return (
    <Row motion={motion}>
      <Pressable
        {...controls}
        disabled={disabled}
        onPress={activate}
        style={({ pressed }) => cellStyle(pressed)}
      >
        {content}
      </Pressable>
    </Row>
  );
});
function StaticCellRow({
  motion,
  children,
  style,
  ...props
}: ViewProps & {
  motion: RowMotion;
  children: import('react').ReactNode;
}) {
  return (
    <View
      {...props}
      style={[
        { position: 'absolute', top: motion.top, left: 0, right: 0 },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export const GridDateColumn = memo(function GridDateColumn({
  store,
  habits,
  day,
  palettes,
  motions,
  heights,
  baseHeight,
  checkboxStyle,
  tapAnimations,
  fontScale,
  width,
  height,
  disabled,
  onPress,
  experiment,
  batchCheckboxes = true,
}: {
  store: ChangeStore;
  habits: Habit[];
  day: GridDay;
  palettes: Record<string, GridPalette>;
  motions: Record<string, RowMotion>;
  heights: Record<string, number>;
  baseHeight: number;
  checkboxStyle: CheckboxStyle;
  tapAnimations: boolean;
  fontScale: number;
  width: number;
  height: number;
  disabled: boolean;
  onPress: CellProps['onPress'];
  experiment?: GridExperiment;
  batchCheckboxes?: boolean;
}) {
  recordPerformance('grid.column.render');
  const theme = useTheme();
  const native = Platform.OS !== 'web';
  const reducedMotion = useReducedMotion();
  const [feedback, setFeedback] = useState<{
    id: string;
    date: string;
    token: number;
  } | null>(null);
  const token = useRef(0);
  const requestFeedback = useCallback(
    (habit: Habit) => {
      if (
        !native ||
        !tapAnimations ||
        reducedMotion ||
        experiment === 'simple-cells'
      )
        return;
      setFeedback({ id: habit.id, date: day.key, token: ++token.current });
    },
    [native, tapAnimations, reducedMotion, experiment, day.key],
  );
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(
      () => setFeedback((current) => (current === feedback ? null : current)),
      220,
    );
    return () => clearTimeout(timer);
  }, [feedback]);
  const activeFeedback =
    feedback?.date === day.key &&
    habits.some((habit) => habit.id === feedback.id)
      ? feedback
      : null;
  const columnPress = useGridColumnPress({
    habits,
    motions,
    heights,
    baseHeight,
    date: day.key,
    disabled,
    moving: !batchCheckboxes && experiment !== 'simple-cells',
    activate: (habit) => {
      const previous =
        store.getSnapshot().replay.state.values[`${habit.id}:${day.key}`];
      onPress(habit, day);
      const next =
        store.getSnapshot().replay.state.values[`${habit.id}:${day.key}`];
      if (
        habitType(habit) === 'checkbox' &&
        checkboxChecked(habit, previous, day.key) !==
          checkboxChecked(habit, next, day.key)
      )
        requestFeedback(habit);
    },
  });
  const checkboxHabits = useMemo(
    () => habits.filter((habit) => habitType(habit) === 'checkbox'),
    [habits],
  );
  const layer =
    native &&
    batchCheckboxes &&
    experiment !== 'simple-cells' &&
    checkboxHabits.length > 0;
  const Root = native ? Pressable : View;
  return (
    <Root
      style={{ width, height, backgroundColor: theme.background }}
      {...(native
        ? {
            ...columnPress.handlers,
            disabled,
            accessible: false,
            focusable: false,
            pointerEvents: 'box-only' as const,
          }
        : {})}
    >
      {habits.map((habit) => (
        <GridCell
          key={habit.id}
          store={store}
          habit={habit}
          day={day}
          palette={palettes[habit.id]}
          motion={motions[habit.id]}
          height={heights[habit.id] ?? baseHeight}
          fontScale={fontScale}
          width={width}
          tapAnimations={tapAnimations}
          checkboxStyle={checkboxStyle}
          disabled={disabled}
          onPress={onPress}
          experiment={experiment}
          nativeControl={native}
          pressed={native && columnPress.pressed === habit.id}
          drawCheckbox={!layer && activeFeedback?.id !== habit.id}
          onFeedback={native ? requestFeedback : undefined}
          animatedPosition={!native || !batchCheckboxes}
        />
      ))}
      {layer && (
        <GridCheckboxLayer width={width} height={height}>
          {checkboxHabits.map((habit) => {
            const rowHeight = heights[habit.id] ?? baseHeight;
            return (
              <CheckboxGraphic
                key={habit.id}
                store={store}
                habit={habit}
                day={day}
                palette={palettes[habit.id]}
                size={Math.max(
                  0,
                  Math.min(28 * fontScale, rowHeight - 16, width - 16),
                )}
                style={checkboxStyle}
                x={width / 2}
                y={
                  motions[habit.id].top +
                  (rowHeight - StyleSheet.hairlineWidth) / 2
                }
                hidden={activeFeedback?.id === habit.id}
                noGoalTint={experiment === 'no-goal-tint'}
              />
            );
          })}
        </GridCheckboxLayer>
      )}
      {native && activeFeedback && (
        <CheckboxTapFeedback
          key={`${activeFeedback.id}:${day.key}`}
          store={store}
          habit={habits.find((habit) => habit.id === activeFeedback.id)!}
          day={day}
          palette={palettes[activeFeedback.id]}
          motion={motions[activeFeedback.id]}
          height={heights[activeFeedback.id] ?? baseHeight}
          width={width}
          fontScale={fontScale}
          checkboxStyle={checkboxStyle}
          token={activeFeedback.token}
          noGoalTint={experiment === 'no-goal-tint'}
          animatedPosition={!batchCheckboxes}
        />
      )}
    </Root>
  );
});

function CheckboxTapFeedback({
  store,
  habit,
  day,
  palette,
  motion,
  height,
  width,
  fontScale,
  checkboxStyle,
  token,
  noGoalTint,
  animatedPosition,
}: Pick<
  CellProps,
  | 'store'
  | 'habit'
  | 'day'
  | 'palette'
  | 'motion'
  | 'height'
  | 'width'
  | 'fontScale'
  | 'checkboxStyle'
> & { token: number; noGoalTint: boolean; animatedPosition: boolean }) {
  const mark = useRef<CheckboxFeedback>(null);
  const selection = useMemo(
    () => entrySelection(store, `${habit.id}:${day.key}`),
    [store, habit.id, day.key],
  );
  const value = useSyncExternalStore(
    selection.subscribe,
    selection.getSnapshot,
  );
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
  useEffect(() => {
    mark.current?.pulse();
  }, [token]);
  return (
    <ReorderRow
      motion={motion}
      animatedPosition={animatedPosition}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        height,
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: StyleSheet.hairlineWidth,
      }}
    >
      <GridCheckboxMark
        ref={mark}
        identity={`${habit.id}:${day.key}`}
        checked={checked}
        style={checkboxStyle}
        checkmark={palette.checkmark}
        size={Math.max(0, Math.min(28 * fontScale, height - 16, width - 16))}
        colour={met ? palette.colour : palette.checkbox}
      />
    </ReorderRow>
  );
}
export const GridDateHeading = memo(function GridDateHeading({
  weekStart,
  weekDividers,
  day,
  width,
}: {
  weekStart: WeekStart;
  weekDividers: boolean;
  day: GridDay;
  width: number;
}) {
  recordPerformance('grid.heading.render');
  return (
    <GridDateLabel
      day={day}
      width={width}
      weekDividers={weekDividers}
      weekStart={weekStart}
    />
  );
});
export const GridDateLabel = memo(function GridDateLabel({
  day,
  width,
  weekStart,
  weekDividers,
}: {
  day: GridDay;
  width: number;
  weekStart: WeekStart;
  weekDividers: boolean;
}) {
  const theme = useTheme();
  const headingStyles = useHeadingStyles();
  const tone = dateTone(theme);
  return (
    <View
      testID="date-heading"
      style={[
        headingStyles.dayHeader,
        { width },
        weekDividers &&
          isShadedWeek(day.key, weekStart) &&
          headingStyles.shadedWeek,
        day.daysAgo === 0 && headingStyles.todayColumn,
      ]}
    >
      <Text
        style={[
          styles.weekday,
          { color: day.daysAgo === 0 ? theme.ink(0xff) : tone.label },
        ]}
      >
        {day.label}
      </Text>
      <Text style={[styles.dayNumber, { color: tone.number }]}>
        {day.number}
      </Text>
    </View>
  );
});
const useHeadingStyles = themedStyles((t) => ({
  dayHeader: {
    backgroundColor: t.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    minHeight: 56,
  },
  shadedWeek: { backgroundColor: t.ink(0x0c) },
  todayColumn: {
    backgroundColor: t.ink(0x19),
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
}));
const styles = StyleSheet.create({
  weekday: { fontSize: 11, fontWeight: '500' },
  dayNumber: {
    fontSize: 19,
    fontWeight: '600',
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  textEntry: {
    fontSize: GRID_ENTRY_FONT_SIZE,
    lineHeight: GRID_ENTRY_LINE_HEIGHT,
    fontWeight: '500',
    width: '100%',
    textAlign: 'center',
  },
  numeric: { fontSize: 18, fontWeight: '500', fontVariant: ['tabular-nums'] },
});
