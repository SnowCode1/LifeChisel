// What the Today view says about each habit and about the day as a whole.
// Pure and derived from the same daily rules as the grid (evaluateGoal).
import type { EntryValue, EntryValues } from './entries.ts';
import { evaluateGoal } from './habitGoals.ts';
import type { Habit } from './habits.ts';

/**
 * done: the goal is met, or a tracking-only habit has a record (a habit done
 * on an unscheduled day counts too).
 * open: still to do (or to record) today.
 * off: not scheduled today and not done, or before the habit's start date.
 */
export type TodayStatus = 'done' | 'open' | 'off';

export function todayStatus(
  habit: Habit,
  value: EntryValue | undefined,
  date: string,
): TodayStatus {
  const goal = evaluateGoal(habit, value, date);
  if (habit.startDate && date < habit.startDate) return 'off';
  if (!goal.active) return value !== undefined ? 'done' : 'open';
  if (goal.met) return 'done';
  return goal.scheduled ? 'open' : 'off';
}

export type TodayCount = { done: number; open: number; off: number };

export function todayCount(
  habits: readonly Habit[],
  values: EntryValues,
  date: string,
): TodayCount {
  const count: TodayCount = { done: 0, open: 0, off: 0 };
  for (const habit of habits)
    count[todayStatus(habit, values[`${habit.id}:${date}`], date)]++;
  return count;
}

/** "4 of 9 done · 2 not today"; '' without habits. */
export function todayCountLabel(count: TodayCount): string {
  const total = count.done + count.open;
  const parts: string[] = [];
  if (total > 0) parts.push(`${count.done} of ${total} done`);
  if (count.off > 0) parts.push(`${count.off} not today`);
  return parts.join(' · ');
}
