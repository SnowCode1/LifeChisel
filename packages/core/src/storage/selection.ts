import { completionMask } from '../habitCompletion.ts';
import type { Habit } from '../habits.ts';
import type { ChangeStore, StoreSnapshot } from './store.ts';

// Primitive/reference-stable selections let mounted cells ignore unrelated
// entries and save acknowledgements. Never cache a second mutable copy of values.
export function selectStore<T>(
  store: ChangeStore,
  select: (snapshot: StoreSnapshot) => T,
) {
  const getSnapshot = () => select(store.getSnapshot());
  return {
    getSnapshot,
    subscribe(listener: () => void) {
      let previous = getSnapshot();
      return store.subscribe(() => {
        const next = getSnapshot();
        if (Object.is(previous, next)) return;
        previous = next;
        listener();
      });
    },
  };
}
export function entrySelection(store: ChangeStore, key: string) {
  return selectStore(store, (snapshot) => snapshot.replay.state.values[key]);
}
export function recordedDaySelection(
  store: ChangeStore,
  habits: Habit[],
  day: string,
) {
  return selectStore(store, (snapshot) =>
    habits.some((habit) => {
      const value = snapshot.replay.state.values[`${habit.id}:${day}`];
      return value !== undefined;
    }),
  );
}

// A primitive mask ignores acknowledgements, numeric totals and unrelated dates.
// Disabled filtering does not subscribe the grid container to entry changes.
export function completedHabitsSelection(
  store: ChangeStore,
  habits: Habit[],
  day: string,
  enabled: boolean,
) {
  return selectStore(store, (snapshot) =>
    enabled ? completionMask(habits, snapshot.replay.state.values, day) : '',
  );
}
