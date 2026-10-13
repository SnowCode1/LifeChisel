import { habitType, type Habit } from './habits.ts';
import type { EntryValues } from './entries.ts';
import { evaluateGoal, ruleIsMet } from './habitGoals.ts';
import {
  cycleLengths,
  ordinal,
  timingDate,
  scheduledCount,
  scheduledOn,
  periodWindow,
  periodMet,
  type GoalPeriod,
} from './goalTiming.ts';

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
export type PeriodResult = {
  id: string;
  start: string;
  end: string;
  count: number;
  period: GoalPeriod;
  status: 'met' | 'missed' | 'progress' | 'rest' | 'partial';
};
// Only changed counts need individual evaluation. Empty windows share the same
// result; cycle/weekday eligibility repeats, so enormous histories stay bounded.
export function periodStatistics(
  habit: Habit,
  values: EntryValues,
  trackingStart: string,
  today: string,
  rangeStart: string,
) {
  const first = ordinal(trackingStart),
    now = ordinal(today),
    range = ordinal(rangeStart);
  const records = Object.entries(values)
    .filter(([key]) => key.startsWith(`${habit.id}:`))
    .map(([key, value]) => ({
      day: ordinal(key.slice(habit.id.length + 1)),
      value,
    }));
  let eligible = 0,
    met = 0,
    streak = 0,
    bestStreak = 0;
  const recent: PeriodResult[] = [];
  let current: PeriodResult | null = null;
  const goals = habit.goals ?? [];
  for (let g = 0; g < goals.length; g++) {
    const goal = goals[g],
      period = goal.period;
    if (goal.from > today) break;
    if (!period || goal.rule.kind === 'none') {
      streak = 0;
      continue;
    }
    const start = Math.max(first, ordinal(goal.from));
    const stop = Math.min(
      now,
      g + 1 < goals.length ? ordinal(goals[g + 1].from) - 1 : now,
    );
    if (stop < start) continue;
    const anchor = ordinal(period.anchor),
      length = period.days;
    const initial = Math.ceil((start - anchor) / length);
    const last = Math.floor((stop - anchor + 1) / length) - 1;
    // Today is still open, including its last day. Policy-truncated periods
    // never become failures and do not silently prorate their target.
    const final = Math.min(last, Math.floor((now - anchor) / length) - 1);
    const baseline =
      habitType(habit) === 'checkbox' &&
      ruleIsMet(goal.rule, Number(goal.defaultChecked ?? false));
    const counts = new Map<number, number>();
    for (const { day, value } of records) {
      if (day < start || day > stop || !scheduledOn(goal, day)) continue;
      const index = Math.floor((day - anchor) / length);
      const delta =
        Number(evaluateGoal(habit, value, timingDate(day)).met) -
        Number(baseline);
      if (delta) counts.set(index, (counts.get(index) ?? 0) + delta);
    }
    const phaseDays = goal.cycle ? cycleLengths(goal.cycle).total * 7 : 7;
    const repeat = phaseDays / gcd(phaseDays, length);
    const emptyCount = (index: number) =>
      baseline
        ? scheduledCount(
            goal,
            anchor + index * length,
            anchor + (index + 1) * length - 1,
          )
        : 0;
    const pattern = Array.from({ length: repeat }, (_, index) => {
      const a = anchor + index * length;
      const active = scheduledCount(goal, a, a + length - 1) > 0;
      return runSummary(active ? periodMet(period, emptyCount(index)) : null);
    });
    const baselineRange = (a: number, b: number) =>
      repeatingRuns(pattern, a, b);
    const active = (index: number) =>
      pattern[((index % repeat) + repeat) % repeat].eligible > 0;
    const rangeFirst = Math.max(initial, Math.ceil((range - anchor) / length));
    const rangeResult = baselineRange(rangeFirst, final);
    eligible += rangeResult.eligible;
    met += rangeResult.met;
    for (const [index, delta] of counts)
      if (index >= rangeFirst && index <= final && active(index))
        met +=
          Number(periodMet(period, emptyCount(index) + delta)) -
          Number(periodMet(period, emptyCount(index)));
    let cursor = initial;
    const applyRun = (summary: RunSummary) => {
      bestStreak = Math.max(bestStreak, summary.best, streak + summary.prefix);
      streak = summary.all ? streak + summary.eligible : summary.suffix;
    };
    for (const [index, delta] of [...counts].sort((a, b) => a[0] - b[0])) {
      if (index < initial || index > final) continue;
      applyRun(baselineRange(cursor, index - 1));
      applyRun(
        runSummary(
          active(index) ? periodMet(period, emptyCount(index) + delta) : null,
        ),
      );
      cursor = index + 1;
    }
    applyRun(baselineRange(cursor, final));
    const result = (index: number): PeriodResult => {
      const a = anchor + index * length,
        b = a + length - 1,
        count =
          (baseline
            ? scheduledCount(goal, Math.max(a, start), Math.min(b, stop))
            : 0) + (counts.get(index) ?? 0);
      const partial = a < start || (b > stop && stop < now);
      const rest =
        scheduledCount(
          goal,
          Math.max(a, start),
          Math.min(b, goals[g + 1] ? ordinal(goals[g + 1].from) - 1 : b),
        ) === 0;
      return {
        id: `${goal.id}:${index}`,
        start: timingDate(Math.max(a, start)),
        end: timingDate(
          Math.min(b, goals[g + 1] ? ordinal(goals[g + 1].from) - 1 : b),
        ),
        count,
        period,
        status: rest
          ? 'rest'
          : partial
            ? 'partial'
            : b >= now
              ? 'progress'
              : periodMet(period, count)
                ? 'met'
                : 'missed',
      };
    };
    const lastVisible = Math.floor((stop - anchor) / length);
    // At most eight rows per policy; retain only the eight most recent overall.
    for (
      let i = Math.max(Math.floor((start - anchor) / length), lastVisible - 7);
      i <= lastVisible;
      i++
    ) {
      const row = result(i);
      if (ordinal(row.end) >= range) recent.push(row);
      if (
        start <= now &&
        stop === now &&
        periodWindow(period, today).index === i
      )
        current = row;
    }
  }
  return {
    eligible,
    met,
    streak,
    bestStreak,
    current,
    recent: recent.sort((a, b) => b.start.localeCompare(a.start)).slice(0, 8),
  };
}

// Compose runs over a repeating eligibility pattern, skipping full cycles in O(log n).
type RunSummary = {
  eligible: number;
  met: number;
  prefix: number;
  suffix: number;
  best: number;
  all: boolean;
};
function runSummary(met: boolean | null): RunSummary {
  return {
    eligible: Number(met !== null),
    met: Number(met === true),
    prefix: Number(met === true),
    suffix: Number(met === true),
    best: Number(met === true),
    all: met !== false,
  };
}
function join(a: RunSummary, b: RunSummary): RunSummary {
  return {
    eligible: a.eligible + b.eligible,
    met: a.met + b.met,
    prefix: a.all ? a.eligible + b.prefix : a.prefix,
    suffix: b.all ? b.eligible + a.suffix : b.suffix,
    best: Math.max(a.best, b.best, a.suffix + b.prefix),
    all: a.all && b.all,
  };
}
function repeatingRuns(
  pattern: RunSummary[],
  from: number,
  to: number,
): RunSummary {
  let result = runSummary(null);
  const size = pattern.length;
  while (from <= to && ((from % size) + size) % size !== 0) {
    result = join(result, pattern[((from % size) + size) % size]);
    from++;
  }
  let cycles = Math.floor((to - from + 1) / size);
  if (cycles > 0) {
    from += cycles * size;
    let block = pattern.reduce(join, runSummary(null));
    while (cycles > 0) {
      if (cycles % 2) result = join(result, block);
      block = join(block, block);
      cycles = Math.floor(cycles / 2);
    }
  }
  while (from <= to) {
    result = join(result, pattern[((from % size) + size) % size]);
    from++;
  }
  return result;
}
