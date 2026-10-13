import {
  entryLabel,
  cellEntryLabel,
  type EntryValue,
} from '@onpurpose/core/entries';
import { checkboxChecked, evaluateGoal } from '@onpurpose/core/habitGoals';
import { timingDate } from '@onpurpose/core/goalTiming';
import { habitType, isNumericHabit, type Habit } from '@onpurpose/core/habits';

/** What the canvas draws for one cell; computed on the JS thread. */
export type CellState = {
  kind: 'checkbox' | 'number' | 'text';
  checked: boolean;
  met: boolean;
  recorded: boolean;
  /** Compact grid label, or "—" for an unrecorded number/text cell. */
  label: string;
  /**
   * Daily expectation: `due` on a scheduled day of a daily goal (missable),
   * `off` on an unscheduled day or before the start date of a goal, `none`
   * for tracking-only habits and period quotas, whose days are never missed.
   */
  schedule: 'none' | 'due' | 'off';
};

export function cellState(
  habit: Habit,
  value: EntryValue | undefined,
  date: string,
): CellState {
  const type = habitType(habit);
  const recorded = value !== undefined;
  const goal = evaluateGoal(habit, value, date);
  return {
    kind:
      type === 'checkbox'
        ? 'checkbox'
        : isNumericHabit(habit)
          ? 'number'
          : 'text',
    checked: type === 'checkbox' && checkboxChecked(habit, value, date),
    met: goal.met,
    recorded,
    label: type === 'checkbox' ? '' : cellEntryLabel(habit, value),
    schedule: !goal.active
      ? 'none'
      : !goal.scheduled
        ? 'off'
        : goal.goal?.period
          ? 'none'
          : 'due',
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

// Streak positions stop counting back after ten years of checked days.
const MAX_STREAK = 3660;

/**
 * Counts consecutive checked days ending at `day` (days ago; older days are
 * larger), walking back through saved values. `memo` shares counts between
 * neighbouring days within one preparation.
 */
export function checkedStreak(
  habit: Habit,
  day: number,
  values: Record<string, EntryValue | undefined>,
  todayOrdinal: number,
  memo: Map<string, number>,
) {
  if (habitType(habit) !== 'checkbox') return 0;
  const pending: string[] = [];
  let count = 0;
  for (let d = day; count < MAX_STREAK; d++) {
    const key = `${habit.id}:${d}`;
    const known = memo.get(key);
    if (known !== undefined) {
      count += known;
      break;
    }
    const date = timingDate(todayOrdinal - d);
    if (!checkboxChecked(habit, values[`${habit.id}:${date}`], date)) break;
    pending.push(key);
    count++;
  }
  pending.forEach((key, index) => memo.set(key, count - index));
  return count;
}
