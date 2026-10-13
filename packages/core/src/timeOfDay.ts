import type { EntryValue, EntryValues } from './entries.ts';
import { habitType, type Habit } from './habits.ts';
import type { HistoryAction } from './storage/model.ts';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export type TimeOfDayStatistics = {
  /** Same-day entries per local hour, 0–23. */
  hours: number[];
  /** Entries with a same-day recording time. */
  counted: number;
  /** All recorded entries in the period, including later-day entries. */
  recorded: number;
  /** Hour with the most entries; the earliest wins a tie. */
  peak: number | null;
};

// Checkbox Off (0) is an explicit not-done override, not a completed entry.
// Numeric zero, text and category selections are recorded values.
function recorded(habit: Habit, value: EntryValue | null | undefined) {
  if (value === null || value === undefined) return false;
  return habitType(habit) !== 'checkbox' || value === 1;
}

/**
 * Local minute of day at which each current entry was last filled from empty.
 * Reads only active History actions: undone groups are already absent and
 * redone groups keep their original edit time. Later corrections to a filled
 * entry keep the original time. Entries filled on a later day are omitted.
 */
export function entryMinutes(
  habit: Habit,
  actions: readonly HistoryAction[],
): Map<string, number> {
  const minutes = new Map<string, number | null>();
  for (const action of actions) {
    const change = action.change;
    if (!('habitId' in change) || change.habitId !== habit.id) continue;
    if (change.kind === 'deleteHabit' && !change.after) minutes.clear();
    if (change.kind !== 'entry') continue;
    if (!recorded(habit, change.after)) minutes.delete(change.date);
    else if (!recorded(habit, change.before)) {
      // Use the offset captured with the edit: travel keeps the local time
      // where the entry was made.
      const local =
        Date.parse(action.firstRecordedAt) + action.utcOffsetMinutes * MINUTE;
      const sameDay =
        new Date(local).toISOString().slice(0, 10) === change.date;
      minutes.set(
        change.date,
        sameDay ? Math.floor((((local % DAY) + DAY) % DAY) / MINUTE) : null,
      );
    }
  }
  const sameDay = new Map<string, number>();
  for (const [date, minute] of minutes)
    if (minute !== null) sameDay.set(date, minute);
  return sameDay;
}

export function timeOfDayStatistics(
  habit: Habit,
  values: EntryValues,
  actions: readonly HistoryAction[],
  from: string,
  to: string,
): TimeOfDayStatistics {
  const hours = Array.from({ length: 24 }, () => 0);
  const minutes = entryMinutes(habit, actions);
  const prefix = `${habit.id}:`;
  let counted = 0,
    total = 0;
  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith(prefix)) continue;
    const date = key.slice(prefix.length);
    if (date < from || date > to || !recorded(habit, value)) continue;
    total++;
    const minute = minutes.get(date);
    if (minute === undefined) continue;
    hours[Math.floor(minute / 60)]++;
    counted++;
  }
  const most = Math.max(...hours);
  return {
    hours,
    counted,
    recorded: total,
    peak: counted ? hours.indexOf(most) : null,
  };
}
