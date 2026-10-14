import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text, useAppWindowDimensions } from './Typography';
import { Icon } from './Icon';
import { addMonths, entryDay } from '@onpurpose/core/calendar';
import { monthDays } from '@onpurpose/core/statistics';
import {
  weekDayOrder,
  type WeekStart,
} from '@onpurpose/core/displayPreferences';
import { themedStyles, useTheme } from './ThemeContext';

const weekdayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const monthLabel = (month: string, style: 'long' | 'short') =>
  new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined, {
    month: style,
    ...(style === 'long' ? { year: 'numeric' } : {}),
  });

// Android has no inline system date picker, so this month calendar sits
// inside our own sheets and editors. iOS keeps its native inline/compact picker.
// Tapping the month title switches to a month/year chooser for distant dates.
export function DateCalendar({
  value,
  today,
  onChange,
  accent,
  weekStart = 'monday',
  marked,
  markedLabel = 'marked',
}: {
  value: string;
  today: string;
  onChange: (date: string) => void;
  /** Selected-day fill, already readable on the background (theme.colour). */
  accent?: string;
  weekStart?: WeekStart;
  /** Days that get a dot; the other days are dimmed. */
  marked?: ReadonlySet<string>;
  /** Spoken after a marked day, e.g. "has changes". */
  markedLabel?: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const fill = accent ?? theme.ink(0xdd);
  const { fontScale } = useAppWindowDimensions();
  const [month, setMonth] = useState(value.slice(0, 7));
  const [choosing, setChoosing] = useState(false);
  const year = Number(month.slice(0, 4));
  const calendar = monthDays(month, weekStart);
  const cellHeight = Math.max(44, Math.ceil(42 * fontScale));
  const step = (by: number) => setMonth((current) => addMonths(current, by));
  return (
    <View>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            choosing
              ? `Year ${year}, choose a month`
              : `${monthLabel(month, 'long')}, choose month and year`
          }
          accessibilityState={{ expanded: choosing }}
          onPress={() => setChoosing((open) => !open)}
          style={styles.title}
        >
          <Text style={styles.titleText}>
            {choosing ? String(year) : monthLabel(month, 'long')}
          </Text>
          <View style={choosing && styles.chevronOpen}>
            <Icon
              name="chevron"
              size={Math.round(15 * Math.max(1, fontScale))}
              strokeWidth={2.2}
              color={theme.ink(0x9c)}
            />
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={choosing ? 'Previous year' : 'Previous month'}
          onPress={() => step(choosing ? -12 : -1)}
          style={styles.nav}
        >
          <View style={{ transform: [{ rotate: '90deg' }] }}>
            <Icon name="chevron" size={20} color={theme.ink(0xd0)} />
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={choosing ? 'Next year' : 'Next month'}
          onPress={() => step(choosing ? 12 : 1)}
          style={styles.nav}
        >
          <View style={{ transform: [{ rotate: '-90deg' }] }}>
            <Icon name="chevron" size={20} color={theme.ink(0xd0)} />
          </View>
        </Pressable>
      </View>
      {choosing ? (
        <View style={styles.months}>
          {Array.from({ length: 12 }, (_, index) => {
            const key = `${year}-${String(index + 1).padStart(2, '0')}`;
            const selected = key === month;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={monthLabel(key, 'long')}
                accessibilityState={{ selected }}
                onPress={() => {
                  setMonth(key);
                  setChoosing(false);
                }}
                style={({ pressed }) => [
                  styles.month,
                  { minHeight: cellHeight, opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <View
                  style={[
                    styles.face,
                    selected && { backgroundColor: theme.ink(0x26) },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      color: selected ? theme.ink(0xff) : theme.ink(0xb8),
                      fontSize: 15,
                    }}
                  >
                    {monthLabel(key, 'short')}
                  </Text>
                </View>
              </Pressable>
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
          {Array.from({ length: calendar.padding }, (_, index) => (
            <View
              key={`blank-${index}`}
              style={[styles.day, { height: cellHeight }]}
            />
          ))}
          {calendar.days.map((day) => {
            const selected = day === value;
            const dot = marked?.has(day);
            return (
              <Pressable
                key={day}
                accessibilityRole="button"
                accessibilityLabel={`${entryDay(day).fullLabel}${day === today ? ', today' : ''}${dot ? `, ${markedLabel}` : ''}`}
                accessibilityState={{ selected }}
                onPress={() => onChange(day)}
                style={({ pressed }) => [
                  styles.day,
                  { minHeight: cellHeight, opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <View
                  style={[
                    styles.face,
                    selected && { backgroundColor: fill },
                    !selected && day === today && styles.today,
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    // Background-coloured digits stay readable on the fill.
                    style={{
                      color: selected
                        ? theme.background
                        : day > today || (marked && !dot)
                          ? theme.ink(0x70)
                          : theme.ink(0xc8),
                      fontSize: 15,
                      fontWeight: selected || day === today ? '600' : '400',
                    }}
                  >
                    {Number(day.slice(8))}
                  </Text>
                  {dot && (
                    <View
                      style={[
                        styles.dot,
                        {
                          backgroundColor: selected
                            ? theme.background
                            : (accent ?? theme.ink(0xc8)),
                        },
                      ]}
                    />
                  )}
                </View>
              </Pressable>
            );
          })}
          {/* Always six weeks, so the card keeps one height between months. */}
          {Array.from(
            { length: 42 - calendar.padding - calendar.days.length },
            (_, index) => (
              <View
                key={`end-${index}`}
                style={[styles.day, { height: cellHeight }]}
              />
            ),
          )}
        </View>
      )}
    </View>
  );
}

const useStyles = themedStyles((t) => ({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  title: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  titleText: { color: t.ink(0xee), fontSize: 17, fontWeight: '700' },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  nav: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: {
    width: '14.2857%',
    textAlign: 'center',
    color: t.ink(0x77),
    fontSize: 11,
    paddingBottom: 8,
  },
  day: { width: '14.2857%', padding: 2 },
  months: { flexDirection: 'row', flexWrap: 'wrap' },
  month: { width: '33.3333%', padding: 3 },
  face: {
    flex: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  today: { borderWidth: 1, borderColor: t.ink(0x55) },
  dot: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
}));
