import type { Change, StoredState, StoredEvent } from './storage/model.ts';
import { sameEntry } from './entries.ts';

export type EntryChange = Extract<Change, { kind: 'entry' }>;
export type EntryReceipt = {
  change: EntryChange;
  sequence: number;
  eventId: string;
};
export function receiptIsCurrent(
  events: StoredEvent[],
  receipt: EntryReceipt,
): boolean {
  if (events[receipt.sequence - 1]?.id !== receipt.eventId) return false;
  for (let index = receipt.sequence; index < events.length; index++) {
    const event = events[index];
    if (
      event.type !== 'initialize' &&
      event.change.kind === 'entry' &&
      event.change.habitId === receipt.change.habitId &&
      event.change.date === receipt.change.date
    )
      return false;
  }
  return true;
}
// A later edit to this entry invalidates the shortcut. Other edits are untouched.
export function entryCorrection(
  state: StoredState,
  change: EntryChange,
): EntryChange | null {
  const habit = state.habits.find((item) => item.id === change.habitId);
  const current = state.values[`${change.habitId}:${change.date}`] ?? null;
  if (!habit || habit.archived || !sameEntry(current, change.after))
    return null;
  return { ...change, before: current, after: change.before };
}
