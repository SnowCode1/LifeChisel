import { entryLabel, cellEntryLabel, type EntryValue } from '../entries.ts';
import { checkboxChecked, evaluateGoal } from '../habitGoals.ts';
import { habitType, isNumericHabit, type Habit } from '../habits.ts';

/** What the canvas draws for one cell; computed on the JS thread. */
export type CellState = {
  kind: 'checkbox' | 'number' | 'text';
  checked: boolean;
  met: boolean;
  recorded: boolean;
  /** Compact grid label, or "—" for an unrecorded number/text cell. */
  label: string;
};

export function cellState(
  habit: Habit,
  value: EntryValue | undefined,
  date: string,
): CellState {
  const type = habitType(habit);
  const recorded = value !== undefined;
  return {
    kind:
      type === 'checkbox'
        ? 'checkbox'
        : isNumericHabit(habit)
          ? 'number'
          : 'text',
    checked: type === 'checkbox' && checkboxChecked(habit, value, date),
    met: evaluateGoal(habit, value, date).met,
    recorded,
    label: type === 'checkbox' ? '' : cellEntryLabel(habit, value),
  };
}

/** Screen-reader description of one cell, as the native grid exposed it. */
export function cellAccessibility(
  habit: Habit,
  value: EntryValue | undefined,
  date: string,
  fullLabel: string,
) {
  const checkbox = habitType(habit) === 'checkbox';
  const goal = evaluateGoal(habit, value, date);
  const recorded = value !== undefined;
  return {
    role: checkbox ? ('checkbox' as const) : ('button' as const),
    checked: checkbox ? checkboxChecked(habit, value, date) : undefined,
    label: `${habit.name}, ${fullLabel}${checkbox ? '' : `, ${value === undefined ? 'not recorded' : entryLabel(habit, value) + (habit.unit ? ` ${habit.unit}` : '')}`}, ${goal.active ? (goal.met ? 'goal met' : recorded ? 'goal not met' : 'not recorded') : 'tracking only'}${goal.active && !goal.scheduled ? ', not scheduled' : ''}`,
    hint: checkbox
      ? 'Toggle this day’s checkbox state'
      : isNumericHabit(habit)
        ? 'Edit this day’s total'
        : habit.type === 'categorical'
          ? 'Choose categories for this day'
          : 'Read or edit this day’s text',
  };
}
