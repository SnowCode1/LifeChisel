import { Text } from './Typography';
import { useMemo, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Icon } from './Icon';
import { HabitSymbol } from './HabitSymbol';
import { DateCalendar } from './DateCalendar';
import type { WeekStart } from '@onpurpose/core/displayPreferences';
import {
  historyHabits,
  type HistoryFilter,
  type HistoryKind,
} from '@onpurpose/core/history';
import type { HistoryAction, StoredState } from '@onpurpose/core/storage/model';
import { useSheetScroll } from './SheetModal';
import { themedStyles, useTheme } from './ThemeContext';

// History filter chips, the habit picker they open, and the jump calendar.

const kinds: { value: HistoryKind | 'all'; label: string; spoken: string }[] = [
  { value: 'all', label: 'All', spoken: 'All changes' },
  { value: 'entries', label: 'Entries', spoken: 'Daily entries' },
  { value: 'edits', label: 'Edits', spoken: 'Habit edits' },
  { value: 'notes', label: 'Notes', spoken: 'Description edits' },
];

export function FilterBar({
  filter,
  habitName,
  habitColor,
  menuOpen,
  onKind,
  onHabitMenu,
}: {
  filter: HistoryFilter;
  habitName: string | null;
  habitColor: string | null;
  menuOpen: boolean;
  onKind: (kind: HistoryFilter['kind']) => void;
  onHabitMenu: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const accent = habitColor ? theme.colour(habitColor) : null;
  return (
    <View style={styles.filters}>
      <View accessibilityRole="tablist" style={styles.kinds}>
        {kinds.map((item) => {
          const selected = filter.kind === item.value;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="tab"
              accessibilityLabel={item.spoken}
              accessibilityState={{ selected }}
              aria-selected={selected}
              onPress={() => onKind(item.value)}
              hitSlop={{ top: 6, bottom: 6 }}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text
                numberOfLines={1}
                style={[styles.chipText, selected && styles.chipTextSelected]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Habit filter, ${habitName ?? 'all habits'}`}
        accessibilityState={{ expanded: menuOpen }}
        onPress={onHabitMenu}
        hitSlop={{ top: 6, bottom: 6 }}
        style={({ pressed }) => [
          styles.chip,
          styles.habitChip,
          accent && {
            backgroundColor: theme.mix(accent, 0.16),
            borderColor: theme.mix(accent, 0.4),
          },
          pressed && { opacity: 0.6 },
        ]}
      >
        {accent && <View style={[styles.dot, { backgroundColor: accent }]} />}
        <Text
          numberOfLines={1}
          style={[
            styles.chipText,
            styles.habitChipText,
            accent && { color: accent },
          ]}
        >
          {habitName ?? 'Habit'}
        </Text>
        <Icon name="chevron" size={12} color={accent ?? theme.ink(0x8f)} />
      </Pressable>
    </View>
  );
}

// A floating panel over the list; tapping outside or Escape closes it.
function Popover({
  top,
  label,
  style,
  onClose,
  children,
}: {
  top: number;
  label: string;
  style: StyleProp<ViewStyle>;
  onClose: () => void;
  children: ReactNode;
}) {
  const styles = useStyles();
  const sheetScroll = useSheetScroll();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />
      <View
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
        style={[styles.popover, style, { top }]}
      >
        <ScrollView {...sheetScroll} bounces={false}>
          {children}
        </ScrollView>
      </View>
    </>
  );
}

export function HabitFilterMenu({
  top,
  state,
  liveHabits,
  actions,
  selected,
  onSelect,
  onClose,
}: {
  top: number;
  state: StoredState;
  liveHabits: StoredState['habits'];
  actions: HistoryAction[];
  selected: string | null;
  onSelect: (habitId: string | null) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  // Scanned only while the menu is open.
  const habits = useMemo(() => historyHabits(state, actions), [state, actions]);
  const liveIds = useMemo(
    () => new Set(liveHabits.map((habit) => habit.id)),
    [liveHabits],
  );
  const options = [
    { id: null, name: 'All habits', color: null, icon: undefined, note: '' },
    ...habits.map((habit) => ({
      id: habit.id,
      name: habit.name,
      color: theme.colour(habit.color),
      icon: habit.icon,
      note: !liveIds.has(habit.id)
        ? 'Deleted'
        : habit.archived
          ? 'Archived'
          : '',
    })),
  ];
  return (
    <Popover
      top={top}
      label="Close habit filter"
      style={styles.menu}
      onClose={onClose}
    >
      {options.map((option) => {
        const isSelected = option.id === selected;
        return (
          <Pressable
            key={option.id ?? 'all'}
            accessibilityRole="button"
            accessibilityLabel={`${option.name}${option.note ? `, ${option.note.toLowerCase()}` : ''}`}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(option.id)}
            style={({ pressed }) => [
              styles.menuItem,
              pressed && { backgroundColor: theme.ink(0x29) },
            ]}
          >
            <View style={styles.menuMark}>
              {option.color &&
                (option.icon ? (
                  <HabitSymbol
                    icon={option.icon}
                    colour={option.color}
                    size={16}
                  />
                ) : (
                  <View
                    style={[styles.dot, { backgroundColor: option.color }]}
                  />
                ))}
            </View>
            <Text
              numberOfLines={1}
              style={[styles.menuText, option.color && { color: option.color }]}
            >
              {option.name}
            </Text>
            {!!option.note && (
              <Text style={styles.menuNote}>{option.note}</Text>
            )}
            {isSelected && (
              <Icon name="tick" size={16} color={theme.ink(0xcf)} />
            )}
          </Pressable>
        );
      })}
    </Popover>
  );
}

export function JumpCalendar({
  top,
  value,
  today,
  weekStart,
  marked,
  onChoose,
  onClose,
}: {
  top: number;
  value: string;
  today: string;
  weekStart: WeekStart;
  marked: ReadonlySet<string>;
  onChoose: (date: string) => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  return (
    <Popover
      top={top}
      label="Close date picker"
      style={styles.calendar}
      onClose={onClose}
    >
      <DateCalendar
        value={value}
        today={today}
        weekStart={weekStart}
        marked={marked}
        markedLabel="has changes"
        onChange={onChoose}
      />
      <Text style={styles.calendarNote}>
        Dots mark days with changes. A day without any opens the closest earlier
        one.
      </Text>
    </Popover>
  );
}

const useStyles = themedStyles((t) => ({
  filters: {
    paddingHorizontal: 20,
    paddingBottom: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  chip: {
    minHeight: 32,
    paddingHorizontal: 11,
    borderRadius: 16,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: t.ink(0x26) },
  chipText: { color: t.ink(0x8f), fontSize: 13, fontWeight: '600' },
  chipTextSelected: { color: t.ink(0xf0) },
  habitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.ink(0x36),
    maxWidth: 170,
  },
  habitChipText: { flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  popover: {
    position: 'absolute',
    borderRadius: 17,
    backgroundColor: t.ink(0x19),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.ink(0x33),
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  menu: {
    right: 16,
    width: '72%',
    maxWidth: 320,
    maxHeight: 380,
    paddingVertical: 6,
  },
  calendar: {
    left: 16,
    right: 16,
    maxHeight: 560,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 12,
  },
  calendarNote: {
    color: t.ink(0x85),
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  menuItem: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  menuMark: { width: 16, alignItems: 'center', justifyContent: 'center' },
  menuText: { flex: 1, color: t.ink(0xdd), fontSize: 14, fontWeight: '500' },
  menuNote: { color: t.ink(0x80), fontSize: 11 },
}));
