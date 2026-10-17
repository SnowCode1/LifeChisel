// What Weeks mode draws for one habit in one calendar week: a number and
// seven day dots. Pure and derived from the same daily rules as the day grid
// (evaluateGoal); nothing here is stored.
import type { EntryValues } from './entries.ts';
import { evaluateGoal } from './habitGoals.ts';
import { isNumericHabit, type Habit } from './habits.ts';
import {
  modulo,
  ordinal,
  periodMet,
  timingDate,
  weekday,
} from './goalTiming.ts';
import type { WeekStart } from './displayPreferences.ts';

/**
 * One day of a week cell, oldest first.
 * done: goal met, or recorded for a tracking-only habit.
 * missed: a scheduled day of a daily goal that has passed unmet.
 * empty: still open (Today), unrecorded tracking, or a quota day not done.
 * off: not scheduled.
 * none: before the habit's start date, or in the future.
 */
export type WeekDot = 'done' | 'missed' | 'empty' | 'off' | 'none';

export type WeekSummary = {
  dots: WeekDot[];
  /** Done days, or the week's total for a numeric habit. */
  count: number;
  /** The number to draw ('' for nothing: no data, or a future week). */
  label: string;
  /** The week's goal is met: every due day, or a weekly quota. */
  met: boolean;
};

/** The first day (ordinal) of the week containing `day`. */
export function weekStartDay(day: number, start: WeekStart) {
  return day - modulo(weekday(day) - (start === 'monday' ? 1 : 0), 7);
}

/**
 * Week columns count back from the current week (0); future weeks are
 * negative. Returns the column's first day as an ordinal.
 */
export function weekColumnStart(
  today: string,
  start: WeekStart,
  weeksAgo: number,
) {
  return weekStartDay(ordinal(today), start) - weeksAgo * 7;
}

/**
 * How many days ago the day grid's rightmost column should be to show the
 * whole week `weeksAgo`: its last day, or Today within the current week.
 */
export function weekJumpDay(today: string, start: WeekStart, weeksAgo: number) {
  const now = ordinal(today);
  const end = weekColumnStart(today, start, weeksAgo) + 6;
  return weeksAgo === 0 ? 0 : now - end;
}

/** The week containing `date`, as weeks ago (negative in the future). */
export function weeksAgoOf(today: string, start: WeekStart, date: string) {
  return Math.round(
    (weekStartDay(ordinal(today), start) - weekStartDay(ordinal(date), start)) /
      7,
  );
}

export function weekSummary(
  habit: Habit,
  values: EntryValues,
  today: string,
  first: number,
): WeekSummary {
  const now = ordinal(today);
  const numeric = isNumericHabit(habit);
  const dots: WeekDot[] = [];
  let done = 0,
    total = 0,
    recorded = 0,
    due = 0,
    missed = 0,
    open = 0,
    future = 0;
  // A weekly quota is judged when the week's goal (at its last past day)
  // has one that lines up with the week.
  let quota: ReturnType<typeof evaluateGoal>['goal'] = null;
  let tracking = true;
  for (let day = first; day < first + 7; day++) {
    const date = timingDate(day);
    const value = values[`${habit.id}:${date}`];
    if (numeric && typeof value === 'number') {
      total += value;
      recorded++;
    }
    if (day > now || (habit.startDate && date < habit.startDate)) {
      if (day > now) future++;
      dots.push('none');
      continue;
    }
    const goal = evaluateGoal(habit, value, date);
    if (goal.active) tracking = false;
    quota = goal.active && goal.goal?.period ? goal.goal : null;
    let dot: WeekDot;
    if (!goal.active) dot = value !== undefined ? 'done' : 'empty';
    else if (goal.met) dot = 'done';
    else if (!goal.scheduled) dot = 'off';
    else if (goal.goal?.period || day === now) dot = 'empty';
    else dot = 'missed';
    if (goal.active && goal.scheduled && !goal.goal?.period) {
      due++;
      if (dot === 'missed') missed++;
      if (day === now && dot !== 'done') open++;
    }
    if (dot === 'done') done++;
    dots.push(dot);
  }
  let met = false;
  const period = quota?.period;
  if (period) {
    // Only a seven-day quota anchored on this week's first day matches the
    // column; others are left unshaded rather than misjudged.
    const aligned =
      period.days === 7 && modulo(ordinal(period.anchor) - first, 7) === 0;
    const finished = future === 0 && first + 6 < now;
    met =
      aligned &&
      periodMet(period, done) &&
      (finished || period.operator === 'atLeast');
  } else if (!tracking)
    met = due > 0 && missed === 0 && open === 0 && future === 0;
  const count = numeric ? total : done;
  const label = numeric
    ? recorded
      ? compactTotal(total)
      : ''
    : future === 7 || done === 0
      ? ''
      : String(done);
  return { dots, count, label, met };
}

/** Week totals in at most about five characters: 12.5, 1234, 12.5k, 1.2M. */
export function compactTotal(value: number) {
  const trim = (n: number, digits: number) => String(Number(n.toFixed(digits)));
  const size = Math.abs(value);
  if (size >= 1e6) return `${trim(value / 1e6, size >= 1e7 ? 0 : 1)}M`;
  if (size >= 1e4) return `${trim(value / 1e3, size >= 1e5 ? 0 : 1)}k`;
  if (size >= 100) return trim(value, 0);
  return trim(value, size >= 10 ? 1 : 2);
}

/** Heading parts for a week column: "Oct" and "12" (its first day). */
export function weekHeading(first: number) {
  const date = new Date(`${timingDate(first)}T00:00:00`);
  return {
    month: date.toLocaleDateString(undefined, { month: 'short' }),
    day: date.getDate(),
    label: `Week of ${date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })}`,
  };
}

/** Screen-reader description of one week cell. */
export function weekCellLabel(
  habit: Habit,
  summary: WeekSummary,
  first: number,
) {
  const heading = weekHeading(first).label;
  const done = summary.dots.filter((dot) => dot === 'done').length;
  const counted = summary.dots.filter((dot) => dot !== 'none').length;
  const days = `${done} of ${counted} days done`;
  const amount = isNumericHabit(habit)
    ? `total ${summary.label || '0'}${habit.unit ? ` ${habit.unit}` : ''}, ${days}`
    : days;
  return `${habit.name}, ${heading}, ${amount}${summary.met ? ', goal met' : ''}`;
}
