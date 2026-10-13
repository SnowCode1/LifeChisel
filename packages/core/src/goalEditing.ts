import { validPeriod, validCycle } from './goalTiming.ts';
import type { Habit } from './habits.ts';
import type { HabitGoal } from './habitGoals.ts';
import { normalizeText, replaceGoal, validGoalTimeline } from './habitGoals.ts';
import { validDate } from './storage/model.ts';

export function parseGoalAmount(text: string): number {
  const value = text.trim();
  return /^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(value)
    ? Number(value.replace(',', '.'))
    : NaN;
}

// Draft validation can explain incomplete input; storage remains the final,
// strict validator and never receives NaN or an incomplete timeline.
export function goalDraftIssue(habit: Habit, goal: HabitGoal): string | null {
  const rule = goal.rule;
  if (rule.kind === 'number') {
    if (!Number.isFinite(rule.target)) return 'Enter a target.';
    if (rule.target < 0 || rule.target > Number.MAX_SAFE_INTEGER)
      return 'Use a target between 0 and 9,007,199,254,740,991.';
    if (rule.operator === 'between') {
      if (!Number.isFinite(rule.upper)) return 'Enter the upper limit.';
      if (rule.upper! < rule.target)
        return 'The upper limit must be at least the lower limit.';
    }
  }
  if (rule.kind === 'categories') {
    if (
      rule.match === 'count' &&
      (!Number.isInteger(rule.count) || rule.count! < 1)
    )
      return 'Enter a whole number of categories, starting at 1.';
    if (
      rule.match === 'count' &&
      rule.count! > (habit.categories?.length ?? 0) - rule.exclude.length
    )
      return 'There are not enough available categories for this count.';
    if (
      rule.match !== 'count' &&
      !rule.ids.length &&
      !(rule.match === 'any' && rule.exclude.length)
    )
      return 'Choose at least one category.';
    if (rule.ids.some((id) => rule.exclude.includes(id)))
      return 'A category cannot be required and excluded at the same time.';
  }
  if (rule.kind === 'text') {
    if (!rule.terms.length) return 'Enter a phrase to match.';
    if (rule.terms.length > 12 || rule.terms.some((term) => term.length > 200))
      return 'Use up to 12 phrases, with at most 200 characters each.';
    if (new Set(rule.terms.map(normalizeText)).size !== rule.terms.length)
      return 'Each phrase should be different.';
  }
  if (goal.period && rule.kind === 'none')
    return 'Choose what counts as a successful day before adding a period goal.';
  if (goal.period && !validPeriod(goal.period))
    return 'Use 1–366 days per period and whole-day targets within that period. The maximum must be at least the minimum.';
  if (goal.cycle && !validCycle(goal.cycle))
    return 'Use 1–366 days or 1–52 weeks for each part of the cycle, with a valid start date.';
  if (!goal.weekdays.length) return 'Choose at least one day of the week.';
  if (!validDate(goal.from)) return 'Choose a valid starting date.';
  if (
    habit.goals?.some((item) => item.id !== goal.id && item.from === goal.from)
  )
    return 'Another goal already starts on this date. Edit that goal in the timeline.';
  return validGoalTimeline(replaceGoal(habit.goals, goal), habit)
    ? null
    : 'This goal cannot be saved. Check its condition or the timeline limit.';
}
