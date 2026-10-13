import type { EntryValues } from './entries.ts';
import { ordinal, timingDate } from './goalTiming.ts';

// A fixed window makes opening an editor independent of lifetime history size.
// Only earlier records count; an explicit zero is a value, a blank is not.
export function recentNumericTotals(
  values: EntryValues,
  habitId: string,
  date: string,
) {
  const amounts = new Map<number, { count: number; recent: number }>();
  const end = ordinal(date);
  for (let ago = 1; ago <= 30; ago++) {
    const value = values[`${habitId}:${timingDate(end - ago)}`];
    if (typeof value !== 'number') continue;
    const previous = amounts.get(value);
    amounts.set(value, {
      count: (previous?.count ?? 0) + 1,
      recent: previous?.recent ?? ago,
    });
  }
  return [...amounts]
    .sort((a, b) => b[1].count - a[1].count || a[1].recent - b[1].recent)
    .slice(0, 3)
    .map(([value]) => value);
}
