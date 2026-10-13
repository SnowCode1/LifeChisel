import { useCallback, useState } from 'react';
import type { EntryDay } from '@onpurpose/core/calendar';
import { sameEntry, type EntryValue } from '@onpurpose/core/entries';
import { habitType, isNumericHabit, type Habit } from '@onpurpose/core/habits';
import {
  checkboxChecked,
  toggleCheckboxValue,
} from '@onpurpose/core/habitGoals';
import { feedback } from './haptics';
import type { QuickUndo } from '@onpurpose/core/quickUndo';
import type { ChangeStore } from '@onpurpose/core/storage/store';

type EntryEditor = {
  key: string;
  habit: Habit;
  day: EntryDay;
  value: EntryValue | null;
};

// Both the grid and statistics use this controller. Draft typing belongs to the
// dialogs; only accepted edits reach storage, with a fresh before-value at Done.
export function useDailyEntryActions(
  store: ChangeStore,
  captureQuickUndo: QuickUndo['capture'],
) {
  const [editing, setEditing] = useState<EntryEditor | null>(null);
  const [recording, setRecording] = useState<EntryEditor | null>(null);
  const closeNumber = useCallback(() => setEditing(null), []);
  const closeRecord = useCallback(() => setRecording(null), []);
  const closeEntries = useCallback(() => {
    setEditing(null);
    setRecording(null);
  }, []);

  const pressCell = useCallback(
    (habit: Habit, day: EntryDay) => {
      if (!store.canEdit()) return;
      const key = `${habit.id}:${day.key}`;
      const before = store.getSnapshot().replay.state.values[key] ?? null;
      if (isNumericHabit(habit)) {
        setEditing({ key, habit, day, value: before });
        feedback('selection');
      } else if (habitType(habit) !== 'checkbox') {
        setRecording({ key, habit, day, value: before });
        feedback('selection');
      } else {
        const after = toggleCheckboxValue(habit, before ?? undefined, day.key);
        const change = {
          kind: 'entry' as const,
          habitId: habit.id,
          date: day.key,
          before,
          after,
        };
        if (store.change(change)) {
          captureQuickUndo(change);
          feedback(
            checkboxChecked(habit, after ?? undefined, day.key)
              ? 'confirm'
              : 'undo',
          );
        }
      }
    },
    [store, captureQuickUndo],
  );

  const saveEntry = useCallback(
    (editor: EntryEditor | null, after: EntryValue | null): boolean => {
      if (!editor || !store.canEdit()) return false;
      const before =
        store.getSnapshot().replay.state.values[editor.key] ?? null;
      if (sameEntry(before, after)) return true;
      const change = {
        kind: 'entry' as const,
        habitId: editor.habit.id,
        date: editor.day.key,
        before,
        after,
      };
      if (!store.change(change)) return false;
      captureQuickUndo(change);
      feedback(after === null ? 'undo' : 'confirm');
      return true;
    },
    [store, captureQuickUndo],
  );
  const saveNumber = useCallback(
    (value: number | null) => saveEntry(editing, value),
    [saveEntry, editing],
  );
  const saveRecord = useCallback(
    (value: EntryValue | null) => saveEntry(recording, value),
    [saveEntry, recording],
  );
  return {
    editing,
    recording,
    pressCell,
    saveNumber,
    saveRecord,
    closeNumber,
    closeRecord,
    closeEntries,
  };
}
