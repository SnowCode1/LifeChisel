import { useMemo } from 'react';
import { sameEntry, type EntryValue } from '@onpurpose/core/entries';
import type { Habit, HabitCategory } from '@onpurpose/core/habits';
import { toggleCheckboxValue } from '@onpurpose/core/habitGoals';
import type { QuickUndo } from '@onpurpose/core/quickUndo';
import type { ChangeStore } from '@onpurpose/core/storage/store';
import {
  sameValue,
  type Change,
  type StoredState,
} from '@onpurpose/core/storage/model';
import { displayDefaults } from '@onpurpose/core/displayPreferences';
import { displayedHabitOrder } from '@onpurpose/core/habitOrdering';

/** Preferences the web app shows in Settings. */
export type WebPreference =
  | 'themeMode'
  | 'darkBackground'
  | 'lightBackground'
  | 'checkboxStyle'
  | 'roundCheckboxes'
  | 'joinedCheckboxes'
  | 'streakNumbers'
  | 'connectorThickness'
  | 'missedDays'
  | 'weekStart'
  | 'weekDividers'
  | 'hideCompleted';
// Kinds added from v19 store null as their first before-value.
const NULLABLE = new Set<WebPreference>([
  'themeMode',
  'darkBackground',
  'lightBackground',
  'roundCheckboxes',
  'joinedCheckboxes',
  'streakNumbers',
  'connectorThickness',
  'missedDays',
]);

/** The storage limit, archived habits included. */
export const MAX_HABITS = 1000;

// Every edit reads its before-value from the current store at the moment it
// is applied, never from a stale render, and produces one ordinary change.
export function useHabitActions(store: ChangeStore, quickUndo: QuickUndo) {
  return useMemo(() => {
    const stored = (habitId: string, date: string) =>
      store.getSnapshot().replay.state.values[`${habitId}:${date}`];
    function saveEntry(habit: Habit, date: string, after: EntryValue | null) {
      if (!store.canEdit()) return false;
      const before = stored(habit.id, date) ?? null;
      if (sameEntry(before, after)) return true;
      const change = {
        kind: 'entry' as const,
        habitId: habit.id,
        date,
        before,
        after,
      };
      if (!store.change(change)) return false;
      quickUndo.capture(change);
      return true;
    }
    return {
      saveEntry,
      toggle(habit: Habit, date: string) {
        const before = stored(habit.id, date);
        return saveEntry(habit, date, toggleCheckboxValue(habit, before, date));
      },
      /** Creates or replaces a habit definition; unchanged saves do nothing. */
      saveHabit(after: Habit) {
        if (!store.canEdit()) return false;
        const habits = store.getSnapshot().replay.state.habits;
        const before = habits.find((habit) => habit.id === after.id) ?? null;
        if (before && sameValue(before, after)) return true;
        if (!before && habits.length >= MAX_HABITS) return false;
        const change = {
          kind: 'habit' as const,
          habitId: after.id,
          index: before ? habits.indexOf(before) : habits.length,
          before,
          after,
        };
        if (!store.change(change)) return false;
        quickUndo.capture(change);
        return true;
      },
      /** Moves a displayed row; hidden and archived habits keep their slots. */
      reorder(displayed: string[]) {
        if (!store.canEdit()) return false;
        const habits = store.getSnapshot().replay.state.habits;
        const before = habits.map((habit) => habit.id);
        const after = displayedHabitOrder(habits, displayed);
        if (before.join('|') === after.join('|')) return false;
        return store.change({ kind: 'order', before, after });
      },
      /**
       * Saves a display preference (outside History and Undo). Newer kinds
       * keep `before: null` until first chosen, so defaults can change later.
       */
      setPreference<K extends WebPreference>(kind: K, after: StoredState[K]) {
        if (!store.canEdit()) return false;
        const state = store.getSnapshot().replay.state;
        const before =
          state[kind] ??
          (NULLABLE.has(kind)
            ? null
            : displayDefaults[kind as keyof typeof displayDefaults]);
        return store.change({ kind, before, after } as Change);
      },
      /** Appends categories created while recording an entry, as one edit. */
      addCategories(habitId: string, added: HabitCategory[]) {
        const habits = store.getSnapshot().replay.state.habits;
        const before = habits.find((habit) => habit.id === habitId);
        if (!before) return false;
        return store.change({
          kind: 'habit',
          habitId,
          index: habits.indexOf(before),
          before,
          after: {
            ...before,
            categories: [...(before.categories ?? []), ...added],
          },
        });
      },
    };
  }, [store, quickUndo]);
}
export type HabitActions = ReturnType<typeof useHabitActions>;
