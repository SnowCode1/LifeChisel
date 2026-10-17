import {
  entryLabel,
  sameEntry,
  type EntryValue,
  type EntryValues,
} from './entries.ts';
import { ordinal, timingDate } from './goalTiming.ts';
import { checkboxChecked, toggleCheckboxValue } from './habitGoals.ts';
import { habitType, isNumericHabit, type Habit } from './habits.ts';
import type { IconName } from './iconNames.ts';
import type { EntriesChange, EntryChange } from './storage/types.ts';
import { MAX_FILL_DATES } from './storage/validation.ts';

// Dragging along a row fills consecutive days with one value. A fill of
// several days is one v22 `entries` change: one undoable action and one
// History row. One changed day stays an ordinary `entry` change.

export { MAX_FILL_DATES };

/** Date keys from `from` to `to` inclusive, in drag order (from first); either direction. */
export function fillDates(from: string, to: string): string[] {
  const start = ordinal(from),
    end = ordinal(to);
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    timingDate(start) !== from ||
    timingDate(end) !== to
  )
    throw new Error('A fill needs two calendar dates.');
  const step = end >= start ? 1 : -1;
  const dates: string[] = [];
  for (let day = start; ; day += step) {
    dates.push(timingDate(day));
    if (day === end) return dates;
  }
}

function fillChange(
  habit: Habit,
  changes: {
    date: string;
    before: EntryValue | null;
    after: EntryValue | null;
  }[],
): EntryChange | EntriesChange | null {
  if (!changes.length) return null;
  if (changes.length === 1) {
    const [{ date, before, after }] = changes;
    return { kind: 'entry', habitId: habit.id, date, before, after };
  }
  if (changes.length > MAX_FILL_DATES)
    throw new Error('A fill can change at most 3660 days.');
  const before: Record<string, EntryValue | null> = {};
  const after: Record<string, EntryValue | null> = {};
  for (const change of changes) {
    before[change.date] = change.before;
    after[change.date] = change.after;
  }
  return { kind: 'entries', habitId: habit.id, before, after };
}

/**
 * The change that sets every date to `checked` for a checkbox habit: dates already in that state are left out.
 * Uses checkboxChecked/toggleCheckboxValue (habitGoals.ts) so dated defaults keep working (explicit 0 = Off override).
 * One changed date → an ordinary { kind: 'entry' } change; several → { kind: 'entries' }; none → null.
 * `before` values come from `values` (pass the current store's values so preconditions hold).
 */
export function checkboxFill(
  habit: Habit,
  values: EntryValues,
  dates: string[],
  checked: boolean,
): EntryChange | EntriesChange | null {
  const changes = [];
  for (const date of new Set(dates)) {
    const current = values[`${habit.id}:${date}`];
    if (checkboxChecked(habit, current, date) === checked) continue;
    changes.push({
      date,
      before: current ?? null,
      after: toggleCheckboxValue(habit, current, date),
    });
  }
  return fillChange(habit, changes);
}

/** Same for number/text/category: every date set to `value` (null clears); equal dates left out (sameEntry-style equality). */
export function valueFill(
  habit: Habit,
  values: EntryValues,
  dates: string[],
  value: EntryValue | null,
): EntryChange | EntriesChange | null {
  const changes = [];
  for (const date of new Set(dates)) {
    const current = values[`${habit.id}:${date}`] ?? null;
    if (sameEntry(current, value)) continue;
    changes.push({ date, before: current, after: value });
  }
  return fillChange(habit, changes);
}

/** The first and last dates of a fill, in calendar order. */
export function fillRange(change: EntriesChange): { from: string; to: string } {
  const dates = Object.keys(change.after).sort();
  return { from: dates[0], to: dates.at(-1)! };
}

/**
 * What a fill set, for History and Undo labels: "Checked 5 days",
 * "Unchecked 3 days", "30 min on 4 days", "Cleared 4 days". Days that were
 * set to different values (an unusual fill) read "Changed N days".
 */
export function fillSummary(
  habit: Habit | undefined,
  change: EntriesChange,
): { summary: string; icon: IconName } {
  const dates = Object.keys(change.after);
  const days = `${dates.length} days`;
  if (!habit) return { summary: `Changed ${days}`, icon: 'tick' };
  if (habitType(habit) === 'checkbox') {
    const checked = new Set(
      dates.map((date) =>
        checkboxChecked(habit, change.after[date] ?? undefined, date),
      ),
    );
    if (checked.size > 1) return { summary: `Changed ${days}`, icon: 'tick' };
    return checked.has(true)
      ? { summary: `Checked ${days}`, icon: 'checked' }
      : { summary: `Unchecked ${days}`, icon: 'unchecked' };
  }
  const first = change.after[dates[0]];
  const typeIcon: IconName = isNumericHabit(habit)
    ? 'number'
    : habit.type === 'categorical'
      ? 'categories'
      : 'text';
  if (!dates.every((date) => sameEntry(change.after[date], first)))
    return { summary: `Changed ${days}`, icon: typeIcon };
  if (first === null) return { summary: `Cleared ${days}`, icon: 'erase' };
  if (isNumericHabit(habit))
    return {
      summary: `${first}${habit.unit ? ` ${habit.unit}` : ''} on ${days}`,
      icon: typeIcon,
    };
  const label = entryLabel(habit, first).replace(/\s+/g, ' ');
  const compact = label.length > 55 ? label.slice(0, 54) + '…' : label;
  return { summary: `${compact} on ${days}`, icon: typeIcon };
}
