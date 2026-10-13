import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { Text } from './Typography';
import {
  weekDayOrder,
  type WeekStart,
} from '@onpurpose/core/displayPreferences';
import type { Habit } from '@onpurpose/core/habits';
import {
  binSeries,
  valueUnit,
  weekdayOf,
  type SeriesDay,
} from '@onpurpose/core/statsSeries';
import { themedStyles, useTheme } from './ThemeContext';

const ROW = 26,
  LABEL = 104,
  COUNT = 40;

/**
 * One row per category in saved order: when it was chosen across the window
 * (days, or weeks/months shaded by how often) or by weekday. Several
 * categories can share a day, so rows never stack into misleading totals.
 * Tapping a row filters the calendar and entries to that category.
 */
export function CategoryMatrix({
  habit,
  days,
  colours,
  weekStart,
  selected,
  onSelect,
}: {
  habit: Habit;
  days: SeriesDay[];
  colours: Map<string, string>;
  weekStart: WeekStart;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const [mode, setMode] = useState<'timeline' | 'weekday'>('timeline');
  const [width, setWidth] = useState(0);
  const counted = days.filter(
    (item) => item.outcome !== 'future' && item.outcome !== 'outside',
  );
  const has = (item: SeriesDay, id: string) =>
    Array.isArray(item.value) && item.value.includes(id);
  const rows = (habit.categories ?? [])
    .map((category) => ({
      category,
      count: counted.filter((item) => has(item, category.id)).length,
    }))
    .filter((row) => !row.category.archived || row.count);
  const bins =
    mode === 'timeline'
      ? binSeries(habit, days, valueUnit(days.length), weekStart)
      : [];
  const order = weekDayOrder(weekStart);
  const columns = mode === 'timeline' ? bins.length : 7;
  const plot = Math.max(0, width - LABEL - COUNT);
  const step = columns ? plot / columns : 0;
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.toggle} accessibilityRole="tablist">
        {(['timeline', 'weekday'] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === value }}
            onPress={() => setMode(value)}
            style={[styles.option, mode === value && styles.chosen]}
          >
            <Text
              style={[
                styles.optionText,
                mode === value && { color: theme.ink(0xff) },
              ]}
            >
              {value === 'timeline' ? 'Over time' : 'By weekday'}
            </Text>
          </Pressable>
        ))}
      </View>
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {mode === 'weekday' && width > 0 && (
          <View style={[styles.row, { height: 18 }]}>
            <View style={{ width: LABEL }} />
            {order.map((day) => (
              <Text
                key={day}
                style={[styles.weekday, { width: step }]}
                numberOfLines={1}
              >
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'][day]}
              </Text>
            ))}
          </View>
        )}
        {width > 0 &&
          rows.map(({ category, count }) => {
            const colour =
                colours.get(category.id) ?? theme.colour(habit.color),
              dimmed = !!selected && selected !== category.id;
            const shares =
              mode === 'timeline'
                ? bins.map((bin) => {
                    const eligible = bin.days.filter(
                      (item) =>
                        item.outcome !== 'future' && item.outcome !== 'outside',
                    );
                    return eligible.length
                      ? eligible.filter((item) => has(item, category.id))
                          .length / eligible.length
                      : null;
                  })
                : order.map((day) => {
                    const eligible = counted.filter(
                      (item) => weekdayOf(item.day) === day,
                    );
                    return eligible.length
                      ? eligible.filter((item) => has(item, category.id))
                          .length / eligible.length
                      : null;
                  });
            const single =
              mode === 'timeline' && valueUnit(days.length) === 'day';
            return (
              <Pressable
                key={category.id}
                accessibilityRole="button"
                accessibilityState={{ selected: selected === category.id }}
                accessibilityLabel={`${category.label}${category.archived ? ', archived' : ''}, ${count} ${count === 1 ? 'day' : 'days'}`}
                accessibilityHint={
                  selected === category.id
                    ? 'Show all categories'
                    : 'Show only this category in the calendar and entries'
                }
                onPress={() =>
                  onSelect(selected === category.id ? null : category.id)
                }
                style={({ pressed }) => [
                  styles.row,
                  { opacity: dimmed ? 0.4 : pressed ? 0.7 : 1 },
                ]}
              >
                <View style={styles.label}>
                  <View style={[styles.swatch, { backgroundColor: colour }]} />
                  <Text numberOfLines={1} style={styles.labelText}>
                    {category.label}
                  </Text>
                </View>
                <Svg width={plot} height={ROW} accessible={false}>
                  {shares.map((share, index) => {
                    const size = Math.min(
                      ROW - 8,
                      Math.max(1, step - (step > 4 ? 2 : 0.6)),
                    );
                    return (
                      <Rect
                        key={index}
                        x={index * step + (step - size) / 2}
                        y={single ? 4 : (ROW - Math.min(ROW - 8, size)) / 2}
                        width={size}
                        height={single ? ROW - 8 : Math.min(ROW - 8, size)}
                        rx={Math.min(3, size / 3)}
                        fill={
                          share === null
                            ? 'transparent'
                            : share > 0
                              ? theme.mix(colour, 0.35 + 0.65 * share)
                              : theme.ink(0x18)
                        }
                      />
                    );
                  })}
                </Svg>
                <Text style={styles.count}>{count}</Text>
              </Pressable>
            );
          })}
      </View>
    </View>
  );
}

const useStyles = themedStyles((t) => ({
  toggle: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    padding: 3,
    gap: 3,
    borderRadius: 10,
    backgroundColor: t.ink(0x15),
  },
  option: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    justifyContent: 'center',
  },
  chosen: { backgroundColor: t.ink(0x2c) },
  optionText: { color: t.ink(0x8f), fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: ROW + 6 },
  label: {
    width: LABEL,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingRight: 8,
  },
  swatch: { width: 8, height: 8, borderRadius: 4 },
  labelText: { flex: 1, color: t.ink(0xc8), fontSize: 13 },
  count: {
    width: COUNT,
    textAlign: 'right',
    color: t.ink(0xa8),
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  weekday: { textAlign: 'center', color: t.ink(0x77), fontSize: 11 },
}));
