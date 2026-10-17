import { useCallback, useRef, useState } from 'react';
import { entryDay, type EntryDay } from '@onpurpose/core/calendar';
import { checkboxFill, valueFill } from '@onpurpose/core/entryFill';
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
  /** A fill: Done applies the value to every one of these dates. */
  fill?: {
    dates: string[];
    /** Tells the grid whether the fill was saved; called once. */
    finish: (saved: boolean) => void;
  };
};

// Both the grid and statistics use this controller. Draft typing belongs to the
// dialogs; only accepted edits reach storage, with a fresh before-value at Done.
export function useDailyEntryActions(
  store: ChangeStore,
  captureQuickUndo: QuickUndo['capture'],
) {
  const [editing, setEditingState] = useState<EntryEditor | null>(null);
  const [recording, setRecordingState] = useState<EntryEditor | null>(null);
  // The open editors, so closing can end a fill outside a state updater.
  const open = useRef<{
    editing: EntryEditor | null;
    recording: EntryEditor | null;
  }>({ editing: null, recording: null });
  const setEditing = useCallback((editor: EntryEditor | null) => {
    open.current.editing = editor;
    setEditingState(editor);
  }, []);
  const setRecording = useCallback((editor: EntryEditor | null) => {
    open.current.recording = editor;
    setRecordingState(editor);
  }, []);
  // Closing a fill's dialog ends its highlight; after a save the grid has
  // already been told, so this late call is ignored there.
  const closeNumber = useCallback(() => {
    open.current.editing?.fill?.finish(false);
    setEditing(null);
  }, [setEditing]);
  const closeRecord = useCallback(() => {
    open.current.recording?.fill?.finish(false);
    setRecording(null);
  }, [setRecording]);
  const closeEntries = useCallback(() => {
    closeNumber();
    closeRecord();
  }, [closeNumber, closeRecord]);

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
    [store, captureQuickUndo, setEditing, setRecording],
  );

  // A run drawn along one row: checkboxes take the state the first tap gave
  // the start cell at once; other types ask for the value in their dialog.
  const fillCells = useCallback(
    (habit: Habit, dates: string[], finish: (saved: boolean) => void) => {
      if (!store.canEdit() || !dates.length) return finish(false);
      const values = store.getSnapshot().replay.state.values;
      const key = `${habit.id}:${dates[0]}`;
      if (habitType(habit) === 'checkbox') {
        const checked = checkboxChecked(habit, values[key], dates[0]);
        const change = checkboxFill(habit, values, dates, checked);
        if (!change || !store.change(change)) return finish(false);
        captureQuickUndo(change);
        feedback(checked ? 'confirm' : 'undo');
        return finish(true);
      }
      const editor: EntryEditor = {
        key,
        habit,
        day: entryDay(dates[0]),
        value: values[key] ?? null,
        fill: { dates, finish },
      };
      if (isNumericHabit(habit)) setEditing(editor);
      else setRecording(editor);
      feedback('selection');
    },
    [store, captureQuickUndo, setEditing, setRecording],
  );

  const saveEntry = useCallback(
    (editor: EntryEditor | null, after: EntryValue | null): boolean => {
      if (!editor || !store.canEdit()) return false;
      if (editor.fill) {
        // Before-values are read now, so the change matches the store.
        const values = store.getSnapshot().replay.state.values;
        const change = valueFill(
          editor.habit,
          values,
          editor.fill.dates,
          after,
        );
        if (change && !store.change(change)) return false;
        if (change) {
          captureQuickUndo(change);
          feedback(after === null ? 'undo' : 'confirm');
        }
        editor.fill.finish(!!change);
        return true;
      }
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
  // Today tiles record a usual total in one tap, without a dialog.
  const recordValue = useCallback(
    (habit: Habit, day: EntryDay, value: EntryValue) => {
      const key = `${habit.id}:${day.key}`;
      const before = store.getSnapshot().replay.state.values[key] ?? null;
      return saveEntry({ key, habit, day, value: before }, value);
    },
    [store, saveEntry],
  );
  const saveRecord = useCallback(
    (value: EntryValue | null) => saveEntry(recording, value),
    [saveEntry, recording],
  );
  return {
    editing,
    recording,
    pressCell,
    fillCells,
    recordValue,
    saveNumber,
    saveRecord,
    closeNumber,
    closeRecord,
    closeEntries,
  };
}
