import type { Change, StoredEvent } from './storage/model.ts';
import type { ChangeStore } from './storage/store.ts';
import {
  entryCorrection,
  receiptIsCurrent,
  type EntryReceipt,
} from './quickEntryUndo.ts';

type HabitChange = Extract<Change, { kind: 'habit' }>;
type Receipt = {
  change: EntryReceipt['change'] | HabitChange;
  sequence: number;
  eventId: string;
  label: string;
  action: 'entry' | 'archive';
};
export const QUICK_UNDO_MS = 4000;
function archiveReceiptIsCurrent(events: StoredEvent[], receipt: Receipt) {
  if (events[receipt.sequence - 1]?.id !== receipt.eventId) return false;
  for (let index = receipt.sequence; index < events.length; index++) {
    const event = events[index];
    if (
      event.type === 'initialize' ||
      !('habitId' in event.change) ||
      event.change.habitId !== receipt.change.habitId
    )
      continue;
    if (event.change.kind === 'deleteHabit') return false;
    if (
      event.change.kind === 'habit' &&
      event.change.before?.archived !== event.change.after?.archived
    )
      return false;
  }
  return true;
}
// Short-lived UI receipts, not another persisted history. Corrections append
// ordinary edits and leave intervening unrelated changes intact.
export function createQuickUndo(store: ChangeStore) {
  let receipt: Receipt | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  function clear() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    receipt = null;
    notify();
  }
  function correction(current: Receipt): Change | null {
    const snapshot = store.getSnapshot();
    if (current.change.kind === 'entry')
      return receiptIsCurrent(snapshot.events, current as EntryReceipt)
        ? entryCorrection(snapshot.replay.state, current.change)
        : null;
    if (!archiveReceiptIsCurrent(snapshot.events, current)) return null;
    const before = snapshot.replay.state.habits.find(
      (habit) => habit.id === current.change.habitId,
    );
    if (!before?.archived) return null;
    const { archived: _archived, ...definition } = before;
    const after = {
      ...definition,
      ...(current.change.before?.archived === false ? { archived: false } : {}),
    };
    return {
      kind: 'habit',
      habitId: before.id,
      index: snapshot.replay.state.habits.indexOf(before),
      before,
      after,
    };
  }
  return {
    capture(change: EntryReceipt['change'] | HabitChange) {
      if (
        change.kind === 'habit' &&
        (!change.before || change.before.archived || !change.after?.archived)
      )
        return;
      const snapshot = store.getSnapshot();
      const habit = snapshot.replay.state.habits.find(
        (habit) => habit.id === change.habitId,
      );
      const event = snapshot.events.at(-1);
      if (
        !habit ||
        !event ||
        event.type !== 'change' ||
        event.change !== change
      )
        return;
      if (timer !== null) clearTimeout(timer);
      receipt = {
        change,
        sequence: snapshot.events.length,
        eventId: event.id,
        label: habit.name,
        action: change.kind === 'entry' ? 'entry' : 'archive',
      };
      timer = setTimeout(clear, QUICK_UNDO_MS);
      notify();
    },
    getSnapshot: () => (receipt && correction(receipt) ? receipt : null),
    subscribe(listener: () => void) {
      listeners.add(listener);
      const unsubscribe = store.subscribe(listener);
      return () => {
        listeners.delete(listener);
        unsubscribe();
      };
    },
    undo() {
      if (!receipt) return false;
      const change = correction(receipt);
      if (!change || !store.change(change)) return false;
      clear();
      return true;
    },
    dispose: clear,
  };
}
export type QuickUndo = ReturnType<typeof createQuickUndo>;
