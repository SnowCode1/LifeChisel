import { Pressable, View } from 'react-native';
import { Text } from './Typography';
import type { Habit } from '@onpurpose/core/habits';
import {
  allWeekdays,
  defaultSuccessRule,
  goalAt,
  ruleSummary,
  timingSummary,
} from '@onpurpose/core/habitGoals';
import { Icon } from './Icon';
import { habitType } from '@onpurpose/core/habits';
import { themedStyles, useTheme } from './ThemeContext';

export function GoalSummary({
  habit,
  date,
  onPress,
  disabled = false,
  compact = false,
}: {
  habit: Habit;
  date: string;
  onPress: () => void;
  disabled?: boolean;
  /** A slim row for statistics; the editor keeps the full card. */
  compact?: boolean;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const colour = theme.colour(habit.color);
  const goal = goalAt(habit, date),
    summary = ruleSummary(habit, goal?.rule ?? defaultSuccessRule(habit));
  const schedule = timingSummary(goal ?? { weekdays: allWeekdays });
  const next = habit.goals?.find((version) => version.from > date);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Success goal, ${summary}, ${schedule}`}
      accessibilityHint="Edit the goal, repeat days or starting date; the timeline is available inside"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        compact && styles.compactRow,
        { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 },
      ]}
    >
      <View
        style={[
          styles.symbol,
          compact && styles.compactSymbol,
          { backgroundColor: theme.mix(colour, 0.12) },
        ]}
      >
        <Icon
          name={
            habitType(habit) === 'checkbox'
              ? 'checked'
              : habitType(habit) === 'number'
                ? 'number'
                : habitType(habit) === 'categorical'
                  ? 'categories'
                  : 'text'
          }
          color={colour}
          size={compact ? 17 : 20}
        />
      </View>
      <View style={{ flex: 1, gap: compact ? 1 : 3 }}>
        {!compact && <Text style={styles.label}>Goal</Text>}
        <Text numberOfLines={2} style={styles.value}>
          {compact && <Text style={styles.label}>Goal </Text>}
          {summary}
        </Text>
        <Text style={styles.note}>
          {schedule}
          {next
            ? ` · changes ${new Date(`${next.from}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(next.from.slice(0, 4) !== date.slice(0, 4) ? { year: 'numeric' } : {}) })}`
            : ''}
        </Text>
      </View>
      <View style={{ transform: [{ rotate: '-90deg' }] }}>
        <Icon name="chevron" size={16} color={theme.ink(0x77)} />
      </View>
    </Pressable>
  );
}
const useStyles = themedStyles((t) => ({
  row: {
    minHeight: 60,
    padding: 12,
    backgroundColor: t.ink(0x15),
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  compactRow: {
    minHeight: 52,
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: t.ink(0x11),
    gap: 10,
  },
  compactSymbol: { width: 28, height: 28, borderRadius: 8 },
  label: { fontSize: 12, color: t.ink(0x99) },
  symbol: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { fontSize: 15, color: t.ink(0xdd) },
  note: { fontSize: 12, color: t.ink(0x88) },
}));
