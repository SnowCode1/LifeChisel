import { memo, useSyncExternalStore } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { entryDay, type EntryDay } from '@onpurpose/core/calendar';
import {
  cellAccessibility,
  cellState,
  checkedStreak,
} from '@onpurpose/core/cellAccessibility';
import type {
  CellLook,
  CheckboxStyle,
} from '@onpurpose/core/displayPreferences';
import type { EntryValue, EntryValues } from '@onpurpose/core/entries';
import { ordinal } from '@onpurpose/core/goalTiming';
import type { GridPalette } from '@onpurpose/core/gridAppearance';
import { habitInitial } from '@onpurpose/core/gridModes';
import { habitSummary } from '@onpurpose/core/habitSummary';
import { habitType, type Habit } from '@onpurpose/core/habits';
import { checkboxChecked } from '@onpurpose/core/habitGoals';
import { recentNumericTotals } from '@onpurpose/core/numericSuggestions';
import type { ChangeStore } from '@onpurpose/core/storage/store';
import {
  todayCount,
  todayCountLabel,
  todayStatus,
} from '@onpurpose/core/todaySummary';
import { HabitSymbol } from './HabitSymbol';
import { Icon } from './Icon';
import { Text } from './Typography';
import { useTheme } from './ThemeContext';
import { feedback } from './haptics';

const GAP = 10;
const MIN_TILE = 104;

/** How many tiles fit across `width`: at least two. */
export function todayColumns(width: number, fontScale: number) {
  const tile = MIN_TILE * Math.max(1, fontScale);
  return Math.max(2, Math.floor((width + GAP) / (tile + GAP)));
}

// Today mode: one tile per habit in the user's order, read left to right,
// with no date or name axes. A tile is the habit's name cell over its Today
// cell: the checkbox (drawn with the saved cell look) toggles, a blank
// number records in one tap from its usual totals, other types open their
// dialog. Under the name sits the grid's line (schedule, rule or quota
// progress); a habit not scheduled today dims. Holding a tile opens the
// habit's Notes and Statistics.
export function TodayTiles({
  store,
  habits,
  palettes,
  today,
  width,
  fontScale,
  rowHeight,
  checkboxStyle,
  cellLook,
  disabled,
  tapAnimations,
  onCellPress,
  onCellValue,
  onHabitPress,
}: {
  store: ChangeStore;
  habits: Habit[];
  palettes: Record<string, GridPalette>;
  today: string;
  width: number;
  fontScale: number;
  /** The grid's row height (the Rows size); tiles are about 2.5 rows tall. */
  rowHeight: number;
  checkboxStyle: CheckboxStyle;
  cellLook: CellLook;
  disabled: boolean;
  tapAnimations: boolean;
  onCellPress: (habit: Habit, day: EntryDay) => void;
  onCellValue: (habit: Habit, day: EntryDay, value: EntryValue) => boolean;
  onHabitPress: (habit: Habit) => void;
}) {
  const theme = useTheme();
  const values = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().replay.state.values,
  );
  const columns = todayColumns(width, fontScale);
  const tileWidth = Math.floor((width - GAP * (columns - 1)) / columns);
  const day = entryDay(today);
  const label = new Date(`${today}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const count = todayCountLabel(todayCount(habits, values, today));
  return (
    <View style={{ paddingTop: 4 }}>
      <Text
        accessibilityRole="header"
        style={{
          color: theme.ink(0x97),
          fontSize: 13,
          fontWeight: '600',
          marginBottom: 10,
          marginHorizontal: 2,
        }}
      >
        {label}
        {count ? (
          <Text style={{ color: theme.ink(0x70), fontWeight: '500' }}>
            {` · ${count}`}
          </Text>
        ) : null}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
        {habits.map((habit) => (
          <TodayTile
            key={habit.id}
            store={store}
            habit={habit}
            value={values[`${habit.id}:${today}`]}
            values={values}
            palette={palettes[habit.id]}
            today={today}
            day={day}
            width={tileWidth}
            height={Math.max(Math.round(rowHeight * 2.45), 137)}
            fontScale={fontScale}
            checkboxStyle={checkboxStyle}
            cellLook={cellLook}
            disabled={disabled}
            tapAnimations={tapAnimations}
            onCellPress={onCellPress}
            onCellValue={onCellValue}
            onHabitPress={onHabitPress}
          />
        ))}
      </View>
    </View>
  );
}

// Tiles redraw only when their own value or inputs change.
const TodayTile = memo(function TodayTile({
  store,
  habit,
  value,
  values,
  palette,
  today,
  day,
  width,
  height,
  fontScale,
  checkboxStyle,
  cellLook,
  disabled,
  tapAnimations,
  onCellPress,
  onCellValue,
  onHabitPress,
}: {
  store: ChangeStore;
  habit: Habit;
  value: EntryValue | undefined;
  /** Every saved value, for the summary line, streak and usual totals. */
  values: EntryValues;
  palette: GridPalette | undefined;
  today: string;
  day: EntryDay;
  width: number;
  height: number;
  fontScale: number;
  checkboxStyle: CheckboxStyle;
  cellLook: CellLook;
  disabled: boolean;
  tapAnimations: boolean;
  onCellPress: (habit: Habit, day: EntryDay) => void;
  onCellValue: (habit: Habit, day: EntryDay, value: EntryValue) => boolean;
  onHabitPress: (habit: Habit) => void;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const pulse = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const colour = palette?.colour ?? theme.colour(habit.color);
  const state = cellState(habit, value, today);
  const status = todayStatus(habit, value, today);
  const a11y = cellAccessibility(habit, value, today, 'Today');
  const checkbox = state.kind === 'checkbox';
  const number = habitType(habit) === 'number';
  const boxes = checkboxStyle === 'boxes';
  const summary =
    status === 'off' ? 'Not today' : habitSummary(habit, values, today);
  // A blank number offers its most usual total (the dialog's first
  // suggestion) as one chip that records in one tap; … opens the dialog,
  // and a recorded value opens it to change it.
  const usual =
    number && !state.recorded && !disabled
      ? recentNumericTotals(values, habit.id, today)[0]
      : undefined;
  const streak =
    checkbox && boxes && cellLook.streakNumbers && state.checked
      ? checkedStreak(habit, 0, values, ordinal(today), new Map())
      : 0;
  const unit = habit.unit ? ` ${habit.unit}` : '';
  const activate = () => {
    if (disabled) return;
    const before = checkboxChecked(habit, value, today);
    onCellPress(habit, day);
    const after = checkboxChecked(
      habit,
      store.getSnapshot().replay.state.values[`${habit.id}:${today}`],
      today,
    );
    // The same tap-only pulse as a grid checkbox (1 → 0.94 → 1), only when
    // an accepted tap flipped the box.
    if (checkbox && after !== before && tapAnimations && !reducedMotion)
      scale.set(
        withSequence(
          withTiming(0.94, { duration: 45, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 135, easing: Easing.out(Easing.cubic) }),
        ),
      );
  };
  const record = (total: number) => {
    if (onCellValue(habit, day, total)) feedback('confirm');
  };
  const background = state.met
    ? (palette?.completedBackground ?? theme.mix(colour, 0.1))
    : theme.ink(0x0e);
  // The checkbox follows the cell look: boxes or ticks and crosses, round
  // boxes, and the streak position in place of the tick.
  const box = Math.round(Math.min(34 * Math.max(1, fontScale), height / 3));
  const boxFill = state.met ? colour : (palette?.checkbox ?? colour);
  return (
    <Animated.View
      style={[{ width, opacity: status === 'off' ? 0.55 : 1 }, pulse]}
    >
      <Pressable
        accessibilityRole={a11y.role}
        accessibilityState={
          a11y.role === 'checkbox'
            ? { checked: a11y.checked, disabled }
            : { disabled }
        }
        accessibilityLabel={`${a11y.label}${summary ? `, ${summary}` : ''}`}
        accessibilityHint={`${a11y.hint}. Hold for notes and statistics`}
        accessibilityActions={[
          { name: 'activate', label: a11y.hint },
          { name: 'details', label: 'Open notes and statistics' },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'activate') activate();
          else if (event.nativeEvent.actionName === 'details')
            onHabitPress(habit);
        }}
        delayLongPress={380}
        onPress={activate}
        onLongPress={() => onHabitPress(habit)}
        style={({ pressed }) => ({
          height,
          overflow: 'hidden',
          padding: 10,
          gap: 6,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: state.met ? `${colour}55` : `${colour}26`,
          backgroundColor: pressed
            ? (palette?.pressed ?? `${colour}20`)
            : background,
        })}
      >
        {/* Icon, name and the grid's line under it. */}
        <View
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 7,
          }}
        >
          {habit.icon ? (
            <HabitSymbol icon={habit.icon} colour={colour} size={20} />
          ) : (
            <Text
              accessible={false}
              style={{ color: colour, fontSize: 16, fontWeight: '700' }}
            >
              {habitInitial(habit.name)}
            </Text>
          )}
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={2}
              style={{
                color: colour,
                fontSize: 14,
                lineHeight: 18,
                fontWeight: '600',
              }}
            >
              {habit.name}
            </Text>
            {!!summary && (
              <Text
                numberOfLines={1}
                style={{ color: theme.ink(0x8c), fontSize: 11, lineHeight: 14 }}
              >
                {summary}
              </Text>
            )}
          </View>
        </View>
        {/* Today's cell: a fixed block at the bottom, the same in every tile. */}
        <View
          style={{ height: 54, alignItems: 'center', justifyContent: 'center' }}
        >
          {usual !== undefined ? (
            <View style={{ alignItems: 'center', gap: 4 }}>
              <Text
                accessible={false}
                style={{ color: theme.ink(0x70), fontSize: 11, lineHeight: 12 }}
              >
                Usual
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Record the usual total, ${usual}${unit}`}
                  onPress={() => record(usual)}
                  style={({ pressed }) => ({
                    height: 34,
                    paddingHorizontal: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderRadius: 10,
                    backgroundColor: pressed ? `${colour}33` : theme.ink(0x1c),
                  })}
                >
                  <Text
                    style={{ color: colour, fontSize: 15, fontWeight: '600' }}
                  >
                    {usual}
                    {unit ? (
                      <Text style={{ fontSize: 12, fontWeight: '500' }}>
                        {unit}
                      </Text>
                    ) : null}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Enter today's total${unit}`}
                  onPress={activate}
                  style={({ pressed }) => ({
                    minWidth: 36,
                    height: 34,
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderRadius: 10,
                    backgroundColor: pressed ? `${colour}33` : theme.ink(0x1c),
                  })}
                >
                  <Text style={{ color: theme.ink(0x97), fontSize: 15 }}>
                    …
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : checkbox ? (
            boxes ? (
              <View
                style={{
                  width: box,
                  height: box,
                  borderRadius: cellLook.roundCheckboxes
                    ? box / 2
                    : Math.round(box * 0.27),
                  borderWidth: 1.5,
                  borderColor: state.checked
                    ? boxFill
                    : state.met
                      ? colour
                      : (palette?.checkbox ?? colour),
                  backgroundColor: state.checked ? boxFill : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {streak > 0 ? (
                  <Text
                    accessible={false}
                    allowFontScaling={false}
                    style={{
                      color: palette?.checkmark ?? theme.background,
                      fontSize: box * (String(streak).length > 2 ? 0.4 : 0.5),
                      fontWeight: '700',
                    }}
                  >
                    {streak}
                  </Text>
                ) : state.checked ? (
                  <Icon
                    name="tick"
                    size={Math.round(box * 0.68)}
                    strokeWidth={2.5}
                    color={palette?.checkmark ?? theme.background}
                  />
                ) : null}
              </View>
            ) : (
              <Icon
                name={state.checked ? 'tick' : 'close'}
                size={Math.round(box * 0.9)}
                strokeWidth={state.checked ? 2.3 : 1.8}
                color={state.met ? colour : (palette?.checkbox ?? colour)}
              />
            )
          ) : (
            <Text
              numberOfLines={2}
              style={{
                textAlign: 'center',
                color: state.recorded ? colour : theme.ink(0x66),
                fontSize: state.recorded && number ? 22 : 14,
                fontWeight: '600',
              }}
            >
              {state.recorded ? state.label : '—'}
              {state.recorded && number && unit ? (
                <Text style={{ fontSize: 12, fontWeight: '500', opacity: 0.8 }}>
                  {unit}
                </Text>
              ) : null}
            </Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
});
