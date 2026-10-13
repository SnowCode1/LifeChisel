import type { EntryValues } from './entries.ts';
import type { Habit } from './habits.ts';

export function archivedHabitDetails(habits: Habit[], values: EntryValues) {
  const rows = habits
    .filter((habit) => habit.archived)
    .map((habit) => ({
      habit,
      count: 0,
      firstDate: null as string | null,
      lastDate: null as string | null,
    }));
  const byId = new Map(rows.map((row) => [row.habit.id, row]));
  for (const key of Object.keys(values)) {
    const separator = key.indexOf(':');
    const row = byId.get(key.slice(0, separator));
    if (!row) continue;
    const date = key.slice(separator + 1);
    row.count++;
    if (!row.firstDate || date < row.firstDate) row.firstDate = date;
    if (!row.lastDate || date > row.lastDate) row.lastDate = date;
  }
  return rows;
}

export function archivedRecordRange(first: string, last: string): string {
  const format = (date: string) =>
    new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  return first === last ? format(first) : `${format(first)} – ${format(last)}`;
}
