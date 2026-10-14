import type { EntryValues } from './entries.ts';
import { habitType, type Habit } from './habits.ts';
import {
  defaultSuccessRule,
  goalAt,
  ruleSummary,
  timingSummary,
} from './habitGoals.ts';
import { periodStatistics } from './periodStatistics.ts';

/**
 * One quiet line describing a habit on `date`, shown under its name where
 * there is room. Priority: progress in an open quota period, then the goal
 * rule (with any non-daily schedule), then the schedule alone for plain
 * checkboxes, then "Track only". Dated, so it follows goal changes.
 */
export function habitSummary(
  habit: Habit,
  values: EntryValues,
  date: string,
): string {
  const goal = goalAt(habit, date);
  const rule = goal?.rule ?? defaultSuccessRule(habit);
  if (rule.kind === 'none') return 'Track only';
  if (goal?.period) {
    const current = periodStatistics(
      habit,
      values,
      trackingStart(habit, values, date),
      date,
      date,
    ).current;
    if (current?.status === 'rest') return 'Rest period';
    if (current) {
      const { operator, target, upper, unit, days } = current.period;
      const within = unit === 'week' ? 'this week' : `this ${days}-day period`;
      const goalText =
        operator === 'between'
          ? `${target}–${upper}`
          : operator === 'atMost'
            ? `at most ${target}`
            : String(target);
      return `${current.count} of ${goalText} ${within}`;
    }
  }
  const timing = timingSummary(goal ?? { weekdays: [0, 1, 2, 3, 4, 5, 6] });
  // A plain checkbox's rule ("Checked") says nothing; its schedule does.
  if (habitType(habit) === 'checkbox' && rule.kind === 'checked') return timing;
  const ruleText = ruleSummary(habit, rule);
  return timing === 'Every day' ? ruleText : `${ruleText} · ${timing}`;
}

// Days before a habit's start never count toward a period.
function trackingStart(habit: Habit, values: EntryValues, date: string) {
  if (habit.startDate) return habit.startDate;
  const prefix = `${habit.id}:`;
  let first = date;
  for (const key of Object.keys(values))
    if (key.startsWith(prefix) && key.slice(prefix.length) < first)
      first = key.slice(prefix.length);
  return first;
}
