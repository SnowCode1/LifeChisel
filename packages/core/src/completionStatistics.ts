import { scheduledCount, type GoalCycle } from './goalTiming.ts';
import type { EntryValues } from './entries.ts';
import { habitType, type Habit } from './habits.ts';
import {
  allWeekdays,
  defaultSuccessRule,
  evaluateGoal,
  ruleIsMet,
  type SuccessRule,
} from './habitGoals.ts';
const DAY = 86400000;
const ordinal = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY;
const weekday = (day: number) => (((day + 4) % 7) + 7) % 7;
type Policy = {
  from: number;
  to: number;
  rule: SuccessRule;
  weekdays: number[];
  cycle?: GoalCycle;
  baseline: boolean;
};
type CompletionData = {
  first: number;
  end: number;
  periods: Policy[];
  overrides: { day: number; delta: number; met: boolean }[];
};

// Defaults are counted over policy intervals; only saved exceptions need individual
// evaluation. Even an imported lifetime of default-on days stays bounded.
export function completionStatistics(
  habit: Habit,
  values: EntryValues,
  trackingStart: string,
  today: string,
  start: string,
) {
  const first = ordinal(trackingStart),
    end = ordinal(today),
    goals = habit.goals ?? [];
  const policies: Policy[] = [
    {
      from: first,
      to: goals.length ? ordinal(goals[0].from) - 1 : end,
      rule: defaultSuccessRule(habit),
      weekdays: allWeekdays,
      baseline: false,
    },
  ];
  goals.forEach((goal, i) =>
    policies.push({
      from: Math.max(first, ordinal(goal.from)),
      to: i + 1 < goals.length ? ordinal(goals[i + 1].from) - 1 : end,
      rule: goal.rule,
      weekdays: goal.weekdays,
      cycle: goal.cycle,
      baseline:
        habitType(habit) === 'checkbox' &&
        ruleIsMet(goal.rule, Number(goal.defaultChecked ?? false)),
    }),
  );
  const overrides: CompletionData['overrides'] = [];
  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith(`${habit.id}:`)) continue;
    const date = key.slice(habit.id.length + 1);
    if (date < trackingStart || date > today) continue;
    const actual = evaluateGoal(habit, value, date);
    if (!actual.scheduled) continue;
    const baseline = evaluateGoal(habit, undefined, date).met;
    if (actual.met !== baseline)
      overrides.push({
        day: ordinal(date),
        delta: Number(actual.met) - Number(baseline),
        met: actual.met,
      });
  }
  overrides.sort((a, b) => a.day - b.day);
  let run = 0,
    longest = 0;
  function apply(met: boolean, count: number) {
    if (!count) return;
    run = met ? run + count : 0;
    longest = Math.max(longest, run);
  }
  for (const policy of policies) {
    if (policy.rule.kind === 'none') continue;
    let cursor = Math.max(first, policy.from);
    const last = Math.min(end, policy.to);
    if (last < cursor) continue;
    // Today has until midnight to succeed and therefore cannot break a streak.
    const todayMet = evaluateGoal(
      habit,
      values[`${habit.id}:${today}`],
      today,
    ).met;
    const limit = last === end && !todayMet ? last - 1 : last;
    for (const change of overrides) {
      if (change.day < cursor || change.day > limit) continue;
      apply(policy.baseline, scheduledCount(policy, cursor, change.day - 1));
      apply(change.met, 1);
      cursor = change.day + 1;
    }
    apply(policy.baseline, scheduledCount(policy, cursor, limit));
  }
  const data = { first, end, periods: policies, overrides };
  return {
    ...summarizeCompletion(data, start, today),
    ...data,
    active: evaluateGoal(habit, values[`${habit.id}:${today}`], today).active,
    streak: run,
    bestStreak: longest,
    successDates: new SuccessfulDates(data),
  };
}
export function summarizeCompletion(
  data: CompletionData,
  from: string,
  to: string,
  onlyWeekday?: number,
) {
  const a = ordinal(from),
    b = ordinal(to);
  let days = 0,
    count = 0;
  for (const policy of data.periods) {
    if (policy.rule.kind === 'none') continue;
    const lower = Math.max(data.first, a, policy.from),
      upper = Math.min(data.end, b, policy.to);
    if (upper < lower) continue;
    const eligible = scheduledCount(policy, lower, upper, onlyWeekday);
    days += eligible;
    if (policy.baseline) count += eligible;
  }
  for (const change of data.overrides)
    if (
      change.day >= a &&
      change.day <= b &&
      (onlyWeekday === undefined || weekday(change.day) === onlyWeekday)
    )
      count += change.delta;
  return { eligible: days, successes: count, rate: days ? count / days : null };
}

class SuccessfulDates {
  readonly data: CompletionData;
  constructor(data: CompletionData) {
    this.data = data;
  }
  has(date: string) {
    return summarizeCompletion(this.data, date, date).successes > 0;
  }
}
