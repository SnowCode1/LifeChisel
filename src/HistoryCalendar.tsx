import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, useAppWindowDimensions } from './Typography';
import { Icon } from './Icon';
import { addMonths, entryDay } from '@onpurpose/core/calendar';
import {
  weekDayOrder,
  type WeekStart,
} from '@onpurpose/core/displayPreferences';
import {
  historyCalendarInfo,
  historyCountLabel,
  type HistoryCalendar as Calendar,
  type HistoryCalendarDay,
} from '@onpurpose/core/history';
import { monthDays } from '@onpurpose/core/statistics';
import type { StoredState } from '@onpurpose/core/storage/model';
import Animated from 'react-native-reanimated';
import { appear } from './motion';
import { useSheetScroll } from './SheetModal';
import { themedStyles, useTheme } from './ThemeContext';

type Scale = 'month' | 'year';
const weekdayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
// Dots per day in the month view; more habits show as "+n".
const DOTS = 4;
const monthLabel = (month: string, style: 'long' | 'short') =>
  new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined, {
    month: style,
    ...(style === 'long' ? { year: 'numeric' } : {}),
  });

/**
 * History as a calendar: a month with a coloured dot for each habit changed
 * that day, or, after tapping the month's title, the whole year with one dot
 * per day in the colour of its most-changed habit (DateCalendar switches the
 * same way). Days are the days changes were made, as in the day list;
 * choosing one opens it there. The web app draws the same calendar from the
 * same core summary (`historyCalendar`).
 */
export function HistoryCalendar({
  calendar,
  state,
  today,
  weekStart,
  bottomInset,
  onChoose,
}: {
  calendar: Calendar;
  state: StoredState;
  today: string;
  weekStart: WeekStart;
  /** Space kept clear for the floating Undo bar. */
  bottomInset: number;
  onChoose: (date: string) => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const sheetScroll = useSheetScroll();
  const { fontScale } = useAppWindowDimensions();
  const [scale, setScale] = useState<Scale>('month');
  const thisMonth = today.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [explained, setExplained] = useState(false);
  const colours = useMemo(
    () =>
      new Map(
        state.habits.map((habit) => [habit.id, theme.colour(habit.color)]),
      ),
    [state.habits, theme],
  );
  const names = useMemo(
    () => new Map(state.habits.map((habit) => [habit.id, habit.name])),
    [state.habits],
  );
  const firstMonth = calendar.first?.slice(0, 7) ?? thisMonth;
  const year = month.slice(0, 4);
  const yearView = scale === 'year';
  const step = yearView ? 12 : 1;
  const canBack = yearView ? year > firstMonth.slice(0, 4) : month > firstMonth;
  const canForward = yearView
    ? year < thisMonth.slice(0, 4)
    : month < thisMonth;
  const spoken = (day: HistoryCalendarDay | undefined, date: string) => {
    const name = `${entryDay(date).fullLabel}${date === today ? ', today' : ''}`;
    if (!day) return `${name}, no changes`;
    const habits = day.habits.map((habit) => names.get(habit.id) ?? 'Habit');
    return `${name}, ${historyCountLabel(day.counts)}${habits.length ? `: ${habits.join(', ')}` : ''}`;
  };
  const cellHeight = Math.max(48, Math.ceil(46 * fontScale));
  const neutral = theme.ink(0x97);

  return (
    <ScrollView
      {...sheetScroll}
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={yearView ? 'Previous year' : 'Previous month'}
          accessibilityState={{ disabled: !canBack }}
          disabled={!canBack}
          onPress={() => setMonth(addMonths(month, -step))}
          style={[styles.arrow, !canBack && styles.arrowDisabled]}
        >
          <View style={{ transform: [{ rotate: '90deg' }] }}>
            <Icon name="chevron" size={18} color={theme.ink(0xd0)} />
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            yearView
              ? `${year}, show its months`
              : `${monthLabel(month, 'long')}, show the whole year`
          }
          accessibilityState={{ expanded: yearView }}
          onPress={() => setScale(yearView ? 'month' : 'year')}
          style={({ pressed }) => [
            styles.title,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text numberOfLines={1} style={styles.titleText}>
            {yearView ? year : monthLabel(month, 'long')}
          </Text>
          <View style={yearView && styles.chevronOpen}>
            <Icon
              name="chevron"
              size={Math.round(14 * Math.max(1, fontScale))}
              strokeWidth={2.2}
              color={theme.ink(0x9c)}
            />
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={yearView ? 'Next year' : 'Next month'}
          accessibilityState={{ disabled: !canForward }}
          disabled={!canForward}
          onPress={() => {
            const next = addMonths(month, step);
            setMonth(next > thisMonth ? thisMonth : next);
          }}
          style={[styles.arrow, !canForward && styles.arrowDisabled]}
        >
          <View style={{ transform: [{ rotate: '-90deg' }] }}>
            <Icon name="chevron" size={18} color={theme.ink(0xd0)} />
          </View>
        </Pressable>
      </View>

      {yearView ? (
        <View style={styles.year}>
          {Array.from({ length: 12 }, (_, index) => {
            const shownMonth = `${year}-${String(index + 1).padStart(2, '0')}`;
            const future = shownMonth > thisMonth;
            const { padding, days } = monthDays(shownMonth, weekStart);
            return (
              <View key={shownMonth} style={styles.miniMonth}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${monthLabel(shownMonth, 'long')}, show month`}
                  accessibilityState={{ disabled: future }}
                  disabled={future}
                  onPress={() => {
                    setMonth(shownMonth);
                    setScale('month');
                  }}
                  hitSlop={{ top: 6, bottom: 6 }}
                >
                  <Text style={[styles.miniTitle, future && styles.dateQuiet]}>
                    {monthLabel(shownMonth, 'short')}
                  </Text>
                </Pressable>
                <View style={styles.miniGrid}>
                  {Array.from({ length: padding }, (_, blank) => (
                    <View key={`blank-${blank}`} style={styles.miniCell} />
                  ))}
                  {days.map((date) => {
                    const day = calendar.days.get(date);
                    const top = day?.habits[0];
                    return (
                      <Pressable
                        key={date}
                        accessibilityRole="button"
                        accessibilityLabel={spoken(day, date)}
                        accessibilityState={{ disabled: !day }}
                        disabled={!day}
                        onPress={() => onChoose(date)}
                        style={[
                          styles.miniCell,
                          date === today && styles.miniToday,
                        ]}
                      >
                        <View
                          style={
                            day
                              ? [
                                  styles.miniDot,
                                  {
                                    backgroundColor: top
                                      ? (colours.get(top.id) ?? neutral)
                                      : neutral,
                                  },
                                ]
                              : styles.miniEmpty
                          }
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.grid}>
          {weekDayOrder(weekStart).map((day) => (
            <Text
              key={day}
              numberOfLines={1}
              importantForAccessibility="no"
              accessibilityElementsHidden
              style={styles.weekday}
            >
              {weekdayLabels[day]}
            </Text>
          ))}
          {(() => {
            const { padding, days } = monthDays(month, weekStart);
            return [
              ...Array.from({ length: padding }, (_, index) => (
                <View key={`blank-${index}`} style={styles.cell} />
              )),
              ...days.map((date) => {
                const day = calendar.days.get(date);
                const shown = day?.habits.slice(0, DOTS) ?? [];
                const extra =
                  (day?.habits.length ?? 0) -
                  shown.length +
                  (day?.other ? 1 : 0);
                return (
                  <View key={date} style={styles.cell}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={spoken(day, date)}
                      accessibilityState={{ disabled: !day }}
                      disabled={!day}
                      onPress={() => onChoose(date)}
                      style={({ pressed }) => [
                        styles.day,
                        { minHeight: cellHeight },
                        day && styles.dayWithChanges,
                        date === today && styles.today,
                        pressed && { opacity: 0.6 },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={[styles.date, !day && styles.dateQuiet]}
                      >
                        {Number(date.slice(8))}
                      </Text>
                      {day && (
                        <View style={styles.dots}>
                          {shown.map((habit) => (
                            <View
                              key={habit.id}
                              style={[
                                styles.dot,
                                {
                                  backgroundColor:
                                    colours.get(habit.id) ?? neutral,
                                },
                              ]}
                            />
                          ))}
                          {!shown.length && day.other > 0 && (
                            <View
                              style={[styles.dot, { backgroundColor: neutral }]}
                            />
                          )}
                          {extra > 0 && shown.length > 0 && (
                            <Text style={styles.more}>+{extra}</Text>
                          )}
                        </View>
                      )}
                    </Pressable>
                  </View>
                );
              }),
            ];
          })()}
        </View>
      )}
      {!calendar.days.size && (
        <Text style={styles.note}>No changes to show.</Text>
      )}
      {/* What the dots mean, behind a bare (i) below a separator. */}
      <View style={styles.foot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="About the calendar"
          accessibilityState={{ expanded: explained }}
          onPress={() => setExplained((value) => !value)}
          hitSlop={6}
          style={({ pressed }) => [
            styles.infoButton,
            { opacity: pressed ? 0.5 : 1 },
          ]}
        >
          <Icon
            name="info"
            size={18}
            color={explained ? theme.ink(0xd0) : theme.ink(0x7a)}
          />
        </Pressable>
        {explained && (
          <Animated.View entering={appear}>
            <Text style={styles.infoText}>{historyCalendarInfo[scale]}</Text>
          </Animated.View>
        )}
      </View>
    </ScrollView>
  );
}

const useStyles = themedStyles((t) => ({
  content: { paddingHorizontal: 16, paddingTop: 2 },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  arrow: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowDisabled: { opacity: 0.3 },
  title: {
    minWidth: 160,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  titleText: { color: t.ink(0xee), fontSize: 17, fontWeight: '700' },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: {
    width: '14.2857%',
    textAlign: 'center',
    color: t.ink(0x77),
    fontSize: 11,
    fontWeight: '600',
    paddingBottom: 6,
  },
  cell: { width: '14.2857%', padding: 2 },
  day: {
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingTop: 5,
    paddingBottom: 6,
    justifyContent: 'space-between',
  },
  dayWithChanges: { backgroundColor: t.ink(0x14) },
  today: { borderWidth: 1.5, borderColor: t.ink(0x8a) },
  date: { color: t.ink(0xe0), fontSize: 13, fontWeight: '600' },
  dateQuiet: { color: t.ink(0x60) },
  dots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 3,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  more: { color: t.ink(0x8f), fontSize: 9 },
  year: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  miniMonth: { width: '33.333%', paddingHorizontal: 5 },
  miniTitle: {
    color: t.ink(0xc0),
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  miniGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  miniCell: {
    width: '14.2857%',
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
  },
  miniToday: { borderWidth: 1, borderColor: t.ink(0x8a) },
  miniDot: { width: 7, height: 7, borderRadius: 3.5 },
  miniEmpty: {
    width: 2.5,
    height: 2.5,
    borderRadius: 1.25,
    backgroundColor: t.ink(0x2a),
  },
  note: {
    color: t.ink(0x85),
    fontSize: 12,
    lineHeight: 17,
    marginTop: 14,
    paddingHorizontal: 4,
  },
  foot: {
    marginTop: 12,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.ink(0x28),
  },
  infoButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -6,
  },
  infoText: {
    color: t.ink(0xad),
    fontSize: 13,
    lineHeight: 19,
    paddingBottom: 8,
  },
}));
