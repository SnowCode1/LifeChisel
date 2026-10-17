import type {
  EntriesChange,
  EntryChange,
  StoredState,
  StoredEvent,
} from './storage/model.ts';
import { sameEntry } from './entries.ts';

export type { EntryChange };
export type EntryReceipt = {
  // One entry, or one fill across several days (v22).
  change: EntryChange | EntriesChange;
  sequence: number;
  eventId: string;
};
function receiptDates(change: EntryChange | EntriesChange): string[] {
  return change.kind === 'entry' ? [change.date] : Object.keys(change.after);
}
export function receiptIsCurrent(
  events: StoredEvent[],
  receipt: EntryReceipt,
): boolean {
  if (events[receipt.sequence - 1]?.id !== receipt.eventId) return false;
  const dates = new Set(receiptDates(receipt.change));
  for (let index = receipt.sequence; index < events.length; index++) {
    const event = events[index];
    if (
      event.type === 'initialize' ||
      (event.change.kind !== 'entry' && event.change.kind !== 'entries') ||
      event.change.habitId !== receipt.change.habitId
    )
      continue;
    if (receiptDates(event.change).some((date) => dates.has(date)))
      return false;
  }
  return true;
}
// A later edit to this entry invalidates the shortcut. Other edits are untouched.
export function entryCorrection(
  state: StoredState,
  change: EntryChange,
): EntryChange | null;
export function entryCorrection(
  state: StoredState,
  change: EntriesChange,
): EntriesChange | null;
export function entryCorrection(
  state: StoredState,
  change: EntryChange | EntriesChange,
): EntryChange | EntriesChange | null;
export function entryCorrection(
  state: StoredState,
  change: EntryChange | EntriesChange,
): EntryChange | EntriesChange | null {
  const habit = state.habits.find((item) => item.id === change.habitId);
  if (!habit || habit.archived) return null;
  if (change.kind === 'entries') {
    // Every filled day must still hold the fill's value.
    const dates = Object.keys(change.after);
    if (
      !dates.every((date) =>
        sameEntry(
          state.values[`${change.habitId}:${date}`] ?? null,
          change.after[date],
        ),
      )
    )
      return null;
    return { ...change, before: change.after, after: change.before };
  }
  const current = state.values[`${change.habitId}:${change.date}`] ?? null;
  if (!sameEntry(current, change.after)) return null;
  return { ...change, before: current, after: change.before };
}
