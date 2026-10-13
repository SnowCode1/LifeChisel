// Calendar arithmetic is UTC ordinal math: a local date never gains/loses a day
// when DST changes. Anchors are saved with goals, independent of preferences.
export type GoalPeriod = {
  unit: 'week' | 'days';
  days: number;
  anchor: string;
  operator: 'atLeast' | 'atMost' | 'between';
  target: number;
  upper?: number;
};
export type GoalCycle = {
  unit: 'days' | 'weeks';
  on: number;
  off: number;
  anchor: string;
};
export type GoalTiming = {
  weekdays: number[];
  period?: GoalPeriod;
  cycle?: GoalCycle;
};
export const ordinal = (date: string) =>
  Date.parse(`${date}T00:00:00Z`) / 86400000;
export const timingDate = (day: number) =>
  new Date(day * 86400000).toISOString().slice(0, 10);
export const modulo = (a: number, b: number) => ((a % b) + b) % b;
export const weekday = (day: number) => modulo(day + 4, 7);
export function validTimingDate(date: unknown): date is string {
  return (
    typeof date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(ordinal(date)) &&
    timingDate(ordinal(date)) === date
  );
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).length === allowed.length &&
  allowed.every((key) => Object.hasOwn(value, key));
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;
export function validPeriod(value: unknown): value is GoalPeriod {
  if (!object(value)) return false;
  return (
    keys(value, [
      'unit',
      'days',
      'anchor',
      'operator',
      'target',
      ...(value.operator === 'between' ? ['upper'] : []),
    ]) &&
    (value.unit === 'week'
      ? value.days === 7
      : value.unit === 'days' && integer(value.days, 1, 366)) &&
    validTimingDate(value.anchor) &&
    ['atLeast', 'atMost', 'between'].includes(String(value.operator)) &&
    integer(
      value.target,
      value.operator === 'atLeast' ? 1 : 0,
      Number(value.days),
    ) &&
    (value.operator !== 'between' ||
      integer(value.upper, Number(value.target), Number(value.days)))
  );
}
export function validCycle(value: unknown): value is GoalCycle {
  if (!object(value)) return false;
  return (
    keys(value, ['unit', 'on', 'off', 'anchor']) &&
    ['days', 'weeks'].includes(String(value.unit)) &&
    integer(value.on, 1, value.unit === 'weeks' ? 52 : 366) &&
    integer(value.off, 1, value.unit === 'weeks' ? 52 : 366) &&
    validTimingDate(value.anchor)
  );
}
export function cycleLengths(cycle: GoalCycle) {
  const unit = cycle.unit === 'weeks' ? 7 : 1;
  return { on: cycle.on * unit, total: (cycle.on + cycle.off) * unit };
}
export function scheduledOn(timing: GoalTiming, day: number) {
  if (!timing.weekdays.includes(weekday(day))) return false;
  if (!timing.cycle) return true;
  const { on, total } = cycleLengths(timing.cycle);
  return modulo(day - ordinal(timing.cycle.anchor), total) < on;
}
function weekdaysBetween(days: number[], from: number, to: number) {
  if (to < from) return 0;
  return days.reduce((count, day) => {
    const first = from + modulo(day - weekday(from), 7);
    return count + (first > to ? 0 : Math.floor((to - first) / 7) + 1);
  }, 0);
}
// Seven cycles restore weekday alignment. Count complete supercycles and at
// most seven remainder blocks, even for millennia of imported dates.
export function scheduledCount(
  timing: GoalTiming,
  from: number,
  to: number,
  onlyWeekday?: number,
) {
  if (to < from) return 0;
  const days =
    onlyWeekday === undefined
      ? timing.weekdays
      : timing.weekdays.filter((day) => day === onlyWeekday);
  const cycle = timing.cycle;
  if (!cycle) return weekdaysBetween(days, from, to);
  const { on, total } = cycleLengths(cycle),
    anchor = ordinal(cycle.anchor),
    span = total * 7;
  let complete = 0;
  for (let block = 0; block < 7; block++)
    complete += weekdaysBetween(
      days,
      anchor + block * total,
      anchor + block * total + on - 1,
    );
  function prefix(end: number) {
    const length = end - anchor,
      whole = Math.floor(length / span),
      remainder = modulo(length, span);
    let count = whole * complete;
    for (let block = 0; block < 7; block++) {
      const start = block * total;
      count += weekdaysBetween(
        days,
        anchor + start,
        anchor + Math.min(start + on, remainder) - 1,
      );
    }
    return count;
  }
  return prefix(to + 1) - prefix(from);
}
export function periodWindow(period: GoalPeriod, date: string) {
  const index = Math.floor(
    (ordinal(date) - ordinal(period.anchor)) / period.days,
  );
  const start = ordinal(period.anchor) + index * period.days;
  return { index, start, end: start + period.days - 1 };
}
export function periodMet(period: GoalPeriod, count: number) {
  return period.operator === 'atLeast'
    ? count >= period.target
    : period.operator === 'atMost'
      ? count <= period.target
      : count >= period.target && count <= period.upper!;
}
export function periodSummary(period: GoalPeriod) {
  const amount =
    period.operator === 'between'
      ? `${period.target}–${period.upper}`
      : `${period.operator === 'atLeast' ? 'At least' : 'At most'} ${period.target}`;
  return `${amount} ${period.target === 1 && period.operator !== 'between' ? 'day' : 'days'} ${period.unit === 'week' ? 'per week' : `per ${period.days}-day period`}`;
}
export function cycleSummary(cycle: GoalCycle) {
  const unit = cycle.unit === 'weeks' ? 'week' : 'day';
  return `${cycle.on} ${unit}${cycle.on === 1 ? '' : 's'} on · ${cycle.off} off`;
}
export function nextPeriodStart(period: GoalPeriod, today: string) {
  const window = periodWindow(period, today);
  return timingDate(
    window.start === ordinal(today) ? window.start : window.end + 1,
  );
}
export function weekAnchor(date: string, start: 'monday' | 'sunday') {
  const day = ordinal(date);
  return timingDate(
    day - modulo(weekday(day) - (start === 'monday' ? 1 : 0), 7),
  );
}
