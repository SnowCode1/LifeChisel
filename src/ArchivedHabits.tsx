import { useMemo } from 'react';
import {
  archivedHabitDetails,
  archivedRecordRange,
} from '@onpurpose/core/archivedHabitDetails';
import { descriptionExcerpt } from '@onpurpose/core/descriptionReading';
import { habitNotes } from '@onpurpose/core/notes';
import type { StoredState } from '@onpurpose/core/storage/model';
import type { EntryValues } from '@onpurpose/core/entries';
import { Text } from './Typography';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import type { Habit } from '@onpurpose/core/habits';
import { habitTypeLabel } from '@onpurpose/core/habits';
import { Icon } from './Icon';
import { HabitSymbol } from './HabitSymbol';
import { appear, disappear, rowTransition } from './motion';
import { useSheetScroll } from './SheetModal';
import { themedStyles, useTheme } from './ThemeContext';
export function confirmArchivedHabitDeletion(
  habit: Habit,
  count: number,
  onDelete: (habit: Habit) => void,
) {
  const title = `Delete “${habit.name}”?`;
  const message = `This will remove the habit, its notes and ${count} recorded ${count === 1 ? 'day' : 'days'}. You can undo this in History. Earlier changes remain in backups.`;
  if (Platform.OS === 'web') {
    if (globalThis.confirm(`${title}\n\n${message}`)) onDelete(habit);
    return;
  }
  Alert.alert(
    title,
    message,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete habit',
        style: 'destructive',
        onPress: () => onDelete(habit),
      },
    ],
    { cancelable: true },
  );
}

export function ArchivedHabits({
  sampleData = false,
  habits,
  values,
  notes,
  editable,
  pending,
  error,
  onRestore,
  onDelete,
  onRetry,
}: {
  sampleData?: boolean;
  habits: Habit[];
  values: EntryValues;
  notes: StoredState['notes'];
  editable: boolean;
  pending: number;
  error: string | null;
  onRestore: (habit: Habit) => void;
  onDelete: (habit: Habit) => void;
  onRetry: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const archived = useMemo(
    () => archivedHabitDetails(habits, values),
    [habits, values],
  );
  // Each archived habit previews its first note with any words.
  const excerpts = useMemo(
    () =>
      new Map(
        habits.flatMap((habit) => {
          const text = habit.archived
            ? habitNotes({ notes }, habit).find((note) => note.text.trim())
                ?.text
            : undefined;
          return text ? [[habit.id, descriptionExcerpt(text)] as const] : [];
        }),
      ),
    [habits, notes],
  );
  const sheetScroll = useSheetScroll();
  return (
    <ScrollView contentContainerStyle={styles.body} {...sheetScroll}>
      <Text style={styles.description}>
        Restore a habit to return it to its place in the grid. Deleting removes
        it and its records; you can undo this in History.
      </Text>
      <Text accessibilityLiveRegion="polite" style={styles.status}>
        {error ??
          (pending
            ? 'Saving changes…'
            : sampleData
              ? 'Sample · temporary'
              : 'Saved on this device')}
      </Text>
      {!!error && (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={styles.restore}
        >
          <Text style={styles.restoreText}>Retry saving</Text>
        </Pressable>
      )}
      {archived.map(({ habit, count, firstDate, lastDate }) => {
        const colour = theme.colour(habit.color);
        return (
          <Animated.View
            key={habit.id}
            entering={appear}
            exiting={disappear}
            layout={rowTransition}
            style={styles.row}
          >
            <View style={styles.rowHeading}>
              <View style={styles.symbol}>
                {habit.icon ? (
                  <HabitSymbol icon={habit.icon} colour={colour} />
                ) : (
                  <View style={[styles.dot, { backgroundColor: colour }]} />
                )}
              </View>
              <Text style={[styles.name, { color: colour, flex: 1 }]}>
                {habit.name}
              </Text>
            </View>
            <View style={styles.details}>
              <Text style={styles.description}>
                {habitTypeLabel(habit)}
                {habit.unit ? ` · ${habit.unit}` : ''} · {count} recorded{' '}
                {count === 1 ? 'day' : 'days'}
              </Text>
              {firstDate && lastDate && (
                <Text style={styles.dateRange}>
                  {archivedRecordRange(firstDate, lastDate)}
                </Text>
              )}
              {!!excerpts.get(habit.id) && (
                <Text
                  numberOfLines={2}
                  ellipsizeMode="tail"
                  style={styles.note}
                >
                  {excerpts.get(habit.id)}
                </Text>
              )}
            </View>
            <View style={styles.actions}>
              <Pressable
                disabled={!editable}
                accessibilityRole="button"
                accessibilityLabel={`Restore ${habit.name}`}
                accessibilityState={{ disabled: !editable }}
                onPress={() => onRestore(habit)}
                style={[styles.action, { opacity: editable ? 1 : 0.4 }]}
              >
                <Text style={styles.restoreText}>Restore</Text>
              </Pressable>
              <Pressable
                disabled={!editable}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${habit.name}`}
                accessibilityHint="Asks for confirmation before deleting this habit and its records."
                accessibilityState={{ disabled: !editable }}
                onPress={() =>
                  confirmArchivedHabitDeletion(habit, count, onDelete)
                }
                style={[styles.action, { opacity: editable ? 1 : 0.4 }]}
              >
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            </View>
          </Animated.View>
        );
      })}
      {!archived.length && (
        <Animated.View entering={appear} style={styles.empty}>
          <Icon name="archive" size={34} />
          <Text style={styles.name}>No archived habits</Text>
          <Text style={[styles.description, { textAlign: 'center' }]}>
            Hold a habit’s name on the grid and choose Archive when you want to
            put it aside.
          </Text>
        </Animated.View>
      )}
    </ScrollView>
  );
}
const useStyles = themedStyles((t) => ({
  body: { padding: 24, paddingTop: 12, gap: 16, flexGrow: 1 },
  description: { color: t.ink(0x90), fontSize: 13, lineHeight: 20 },
  status: { color: t.ink(0x77), fontSize: 12 },
  row: {
    gap: 10,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.ink(0x24),
  },
  rowHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  symbol: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  details: { marginLeft: 34, gap: 5 },
  dateRange: { color: t.ink(0x77), fontSize: 12, lineHeight: 18 },
  note: { color: t.ink(0xb2), fontSize: 13, lineHeight: 20, marginTop: 3 },
  name: { color: t.ink(0xdd), fontSize: 17, fontWeight: '500' },
  restore: {
    minHeight: 44,
    padding: 12,
    borderRadius: 12,
    backgroundColor: t.ink(0x1b),
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  action: {
    flexGrow: 1,
    flexBasis: 120,
    minHeight: 44,
    padding: 12,
    borderRadius: 12,
    backgroundColor: t.ink(0x1b),
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { color: t.colour('#FF9C9C'), fontSize: 13, fontWeight: '600' },
  restoreText: { color: t.ink(0xd8), fontSize: 13, fontWeight: '600' },
  empty: {
    alignItems: 'center',
    gap: 16,
    paddingTop: 64,
    paddingHorizontal: 20,
  },
}));
