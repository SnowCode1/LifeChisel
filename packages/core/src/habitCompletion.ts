import type { EntryValue, EntryValues } from './entries.ts';
import type { Habit } from './habits.ts';
import { evaluateGoal } from './habitGoals.ts';
// Completion depends on the rule effective on the entry's date. A recorded
// numeric/text/category value is not success unless its habit defines that rule.
export function habitIsComplete(
  habit: Habit,
  value: EntryValue | undefined,
  date = '9999-12-31',
) {
  return evaluateGoal(habit, value, date).met;
}
export function completionMask(
  habits: readonly Habit[],
  values: Readonly<EntryValues>,
  day: string,
) {
  return habits
    .map((habit) =>
      habitIsComplete(habit, values[`${habit.id}:${day}`], day) ? '1' : '0',
    )
    .join('');
}
export function visibleHabitRows(
  habits: Habit[],
  mask: string,
  hideCompleted: boolean,
  showingCompleted: boolean,
  rightmostDay: number,
) {
  return !hideCompleted || showingCompleted || rightmostDay !== 0
    ? habits
    : habits.filter((_, index) => mask[index] !== '1');
}
