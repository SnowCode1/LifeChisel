import {
  scheduledOn,
  ordinal,
  validCycle,
  validPeriod,
  cycleSummary,
  periodSummary,
  type GoalCycle,
  type GoalPeriod,
} from './goalTiming.ts';
import { habitType, type Habit } from './habits.ts';
import type { EntryValue } from './entries.ts';

export type SuccessRule =
  | { kind: 'none' }
  | { kind: 'checked' }
  | { kind: 'unchecked' }
  | { kind: 'recorded' }
  | {
      kind: 'number';
      operator: 'atLeast' | 'atMost' | 'between' | 'exactly';
      target: number;
      upper?: number;
    }
  | {
      kind: 'categories';
      match: 'any' | 'all' | 'count';
      ids: string[];
      exclude: string[];
      count?: number;
    }
  | { kind: 'text'; match: 'any' | 'all'; terms: string[] };
export type HabitGoal = {
  id: string;
  from: string;
  rule: SuccessRule;
  weekdays: number[];
  defaultChecked?: boolean;
  period?: GoalPeriod;
  cycle?: GoalCycle;
};
export const MAX_GOAL_VERSIONS = 128;
export const allWeekdays = [0, 1, 2, 3, 4, 5, 6];
export const defaultSuccessRule = (habit: Habit): SuccessRule =>
  habitType(habit) === 'checkbox' ? { kind: 'checked' } : { kind: 'none' };

const dateValid = (date: unknown): date is string =>
  typeof date === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
  new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const fields = (value: Record<string, unknown>, names: string[]) =>
  Object.keys(value).length === names.length &&
  names.every((key) => Object.hasOwn(value, key));
const amount = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= Number.MAX_SAFE_INTEGER;
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
function selectedIds(value: unknown, habit: Habit): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 40 &&
    new Set(value).size === value.length &&
    Array.from(value).every(
      (id, index) =>
        identifier(id) &&
        habit.categories?.some((option) => option.id === id) &&
        (index === 0 || value[index - 1] < id),
    )
  );
}
export function validSuccessRule(
  value: unknown,
  habit: Habit,
): value is SuccessRule {
  if (!record(value)) return false;
  const type = habitType(habit);
  switch (value.kind) {
    case 'none':
      return type !== 'checkbox' && fields(value, ['kind']);
    case 'unchecked':
    case 'checked':
      return type === 'checkbox' && fields(value, ['kind']);
    case 'recorded':
      return type !== 'checkbox' && fields(value, ['kind']);
    case 'number':
      return (
        type === 'number' &&
        ['atLeast', 'atMost', 'between', 'exactly'].includes(
          String(value.operator),
        ) &&
        amount(value.target) &&
        (value.operator === 'between'
          ? fields(value, ['kind', 'operator', 'target', 'upper']) &&
            amount(value.upper) &&
            value.upper >= value.target
          : fields(value, ['kind', 'operator', 'target']))
      );
    case 'categories': {
      if (
        type !== 'categorical' ||
        !selectedIds(value.ids, habit) ||
        !selectedIds(value.exclude, habit)
      )
        return false;
      if (value.ids.some((id) => (value.exclude as string[]).includes(id)))
        return false;
      if (value.match === 'count')
        return (
          fields(value, ['kind', 'match', 'ids', 'exclude', 'count']) &&
          value.ids.length === 0 &&
          Number.isInteger(value.count) &&
          Number(value.count) >= 1 &&
          Number(value.count) <=
            (habit.categories?.length ?? 0) - value.exclude.length
        );
      return (
        ['any', 'all'].includes(String(value.match)) &&
        fields(value, ['kind', 'match', 'ids', 'exclude']) &&
        (value.ids.length > 0 ||
          (value.match === 'any' && value.exclude.length > 0))
      );
    }
    case 'text':
      return (
        type === 'text' &&
        fields(value, ['kind', 'match', 'terms']) &&
        ['any', 'all'].includes(String(value.match)) &&
        Array.isArray(value.terms) &&
        value.terms.length > 0 &&
        value.terms.length <= 12 &&
        Array.from(value.terms).every(
          (term) =>
            typeof term === 'string' &&
            term.trim().length > 0 &&
            term.length <= 200,
        ) &&
        new Set(value.terms.map((term) => normalizeText(term))).size ===
          value.terms.length
      );
    default:
      return false;
  }
}
export function validGoalTimeline(
  value: unknown,
  habit: Habit,
  allowTiming = true,
  allowCheckboxDefaults = true,
): value is HabitGoal[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > MAX_GOAL_VERSIONS
  )
    return false;
  const ids = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const goal = value[index];
    if (
      !record(goal) ||
      !fields(goal, [
        'id',
        'from',
        'rule',
        'weekdays',
        ...(allowCheckboxDefaults && Object.hasOwn(goal, 'defaultChecked')
          ? ['defaultChecked']
          : []),
        ...(allowTiming && Object.hasOwn(goal, 'period') ? ['period'] : []),
        ...(allowTiming && Object.hasOwn(goal, 'cycle') ? ['cycle'] : []),
      ]) ||
      (Object.hasOwn(goal, 'period') &&
        (!validPeriod(goal.period) ||
          !Array.isArray(goal.weekdays) ||
          goal.weekdays.length !== 7 ||
          (record(goal.rule) && goal.rule.kind === 'none'))) ||
      (Object.hasOwn(goal, 'cycle') && !validCycle(goal.cycle)) ||
      !identifier(goal.id) ||
      ids.has(goal.id) ||
      !dateValid(goal.from) ||
      (index > 0 && value[index - 1].from >= goal.from) ||
      !validSuccessRule(goal.rule, habit) ||
      (!allowCheckboxDefaults &&
        record(goal.rule) &&
        goal.rule.kind === 'unchecked') ||
      (Object.hasOwn(goal, 'defaultChecked') &&
        (habitType(habit) !== 'checkbox' ||
          typeof goal.defaultChecked !== 'boolean')) ||
      !Array.isArray(goal.weekdays) ||
      !goal.weekdays.length ||
      goal.weekdays.length > 7 ||
      !Array.from(goal.weekdays).every(
        (day, i) =>
          Number.isInteger(day) &&
          day >= 0 &&
          day <= 6 &&
          (i === 0 || (goal.weekdays as number[])[i - 1] < day),
      )
    )
      return false;
    ids.add(goal.id);
  }
  return true;
}
export function goalAt(habit: Habit, date: string): HabitGoal | null {
  const goals = habit.goals ?? [];
  let low = 0,
    high = goals.length - 1,
    found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (goals[mid].from <= date) {
      found = mid;
      low = mid + 1;
    } else high = mid - 1;
  }
  return found < 0 ? null : goals[found];
}
export const normalizeText = (text: string) =>
  text.trim().replace(/\s+/g, ' ').toLowerCase();
export function ruleIsMet(
  rule: SuccessRule,
  value: EntryValue | undefined,
): boolean {
  if (value === undefined || rule.kind === 'none') return false;
  switch (rule.kind) {
    case 'checked':
      return value === 1;
    case 'unchecked':
      return value === 0;
    case 'recorded':
      return (
        typeof value === 'number' ||
        (typeof value === 'string' ? !!value.trim() : value.length > 0)
      );
    case 'number':
      return (
        typeof value === 'number' &&
        (rule.operator === 'atLeast'
          ? value >= rule.target
          : rule.operator === 'atMost'
            ? value <= rule.target
            : rule.operator === 'exactly'
              ? value === rule.target
              : value >= rule.target && value <= rule.upper!)
      );
    case 'categories':
      return (
        Array.isArray(value) &&
        value.length > 0 &&
        !rule.exclude.some((id) => value.includes(id)) &&
        (rule.match === 'count'
          ? value.length >= rule.count!
          : rule.match === 'all'
            ? rule.ids.every((id) => value.includes(id))
            : !rule.ids.length || rule.ids.some((id) => value.includes(id)))
      );
    case 'text': {
      if (typeof value !== 'string' || !value.trim()) return false;
      const text = normalizeText(value),
        terms = rule.terms.map(normalizeText);
      return rule.match === 'all'
        ? terms.every((term) => text.includes(term))
        : terms.some((term) => text.includes(term));
    }
  }
}
type DatePolicy = {
  goal: HabitGoal | null;
  rule: SuccessRule;
  active: boolean;
  scheduled: boolean;
  withinStart: boolean;
  defaultChecked: boolean;
};
const policies = new WeakMap<
  Habit,
  {
    goals: Habit['goals'];
    start: Habit['startDate'];
    type: ReturnType<typeof habitType>;
    dates: Map<string, DatePolicy>;
  }
>();
export const MAX_CACHED_GOAL_DATES = 256;
// Cache date/definition work, never entry values or completion results. Store
// definitions are immutable; edits, Undo and restore replace their identities.
function datePolicy(habit: Habit, date: string): DatePolicy {
  const type = habitType(habit);
  let cache = policies.get(habit);
  if (
    !cache ||
    cache.goals !== habit.goals ||
    cache.start !== habit.startDate ||
    cache.type !== type
  ) {
    cache = {
      goals: habit.goals,
      start: habit.startDate,
      type,
      dates: new Map(),
    };
    policies.set(habit, cache);
  }
  const saved = cache.dates.get(date);
  if (saved) return saved;
  const goal = goalAt(habit, date);
  const rule = goal?.rule ?? defaultSuccessRule(habit);
  const active = rule.kind !== 'none';
  const withinStart = !habit.startDate || date >= habit.startDate;
  const policy = {
    goal,
    rule,
    active,
    withinStart,
    scheduled:
      withinStart &&
      active &&
      scheduledOn(goal ?? { weekdays: allWeekdays }, ordinal(date)),
    defaultChecked: withinStart && (goal?.defaultChecked ?? false),
  };
  if (cache.dates.size >= MAX_CACHED_GOAL_DATES)
    cache.dates.delete(cache.dates.keys().next().value!);
  cache.dates.set(date, policy);
  return policy;
}
export function evaluateGoal(
  habit: Habit,
  value: EntryValue | undefined,
  date: string,
) {
  const { goal, rule, active, withinStart, scheduled, defaultChecked } =
    datePolicy(habit, date);
  const met =
    withinStart &&
    ruleIsMet(
      rule,
      habitType(habit) === 'checkbox'
        ? Number(value === 1 || value === 0 ? value === 1 : defaultChecked)
        : value,
    );
  return { goal, rule, active, scheduled, met, recorded: value !== undefined };
}
export function ruleSummary(habit: Habit, rule: SuccessRule): string {
  const unit = habit.unit ? ` ${habit.unit}` : '';
  const labels = (ids: string[]) =>
    ids
      .map(
        (id) =>
          habit.categories?.find((option) => option.id === id)?.label ?? id,
      )
      .join(
        rule.kind === 'categories' && rule.match === 'all' ? ' + ' : ' or ',
      );
  switch (rule.kind) {
    case 'none':
      return 'Track only';
    case 'checked':
      return 'Checked';
    case 'unchecked':
      return 'Unchecked';
    case 'recorded':
      return habitType(habit) === 'text'
        ? 'Any nonblank text'
        : habitType(habit) === 'categorical'
          ? 'Any selection'
          : 'Any recorded total';
    case 'number':
      return rule.operator === 'between'
        ? `Between ${rule.target} and ${rule.upper}${unit}`
        : `${{ atLeast: 'At least', atMost: 'At most', exactly: 'Exactly' }[rule.operator]} ${rule.target}${unit}`;
    case 'categories':
      return `${rule.match === 'count' ? `At least ${rule.count} selected` : rule.ids.length ? `${rule.match === 'all' ? 'All of' : 'Any of'} ${labels(rule.ids)}` : 'Any selection'}${rule.exclude.length ? ` · without ${labels(rule.exclude)}` : ''}`;
    case 'text':
      return `Contains ${rule.match}: ${rule.terms.join(' · ')}`;
  }
}
export function scheduleSummary(weekdays: number[]) {
  return weekdays.length === 7
    ? 'Every day'
    : [1, 2, 3, 4, 5, 6, 0]
        .filter((day) => weekdays.includes(day))
        .map((day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day])
        .join(' · ');
}
export function replaceGoal(
  goals: HabitGoal[] | undefined,
  goal: HabitGoal,
): HabitGoal[] {
  return [...(goals ?? []).filter((item) => item.id !== goal.id), goal].sort(
    (a, b) => a.from.localeCompare(b.from),
  );
}

// A new draft may update the same effective-date slot, but changing its date
// must create a new version rather than moving the current one. Explicit
// timeline edits retain the selected ID and can deliberately move a version.
export function resolveGoalDraft(
  goals: HabitGoal[] | undefined,
  draft: HabitGoal,
  editingVersion: boolean,
): HabitGoal {
  if (editingVersion) return draft;
  const sameDate = goals?.find((goal) => goal.from === draft.from);
  return sameDate ? { ...draft, id: sameDate.id } : draft;
}

export function timingSummary(
  goal: Pick<HabitGoal, 'weekdays' | 'period' | 'cycle'>,
) {
  return [
    goal.period ? periodSummary(goal.period) : scheduleSummary(goal.weekdays),
    goal.cycle ? cycleSummary(goal.cycle) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// Missing records inherit the dated default; explicit zero is an unchecked override.
export function checkboxChecked(
  habit: Habit,
  value: EntryValue | undefined,
  date: string,
): boolean {
  if (value === 1 || value === 0) return value === 1;
  return datePolicy(habit, date).defaultChecked;
}
export function toggleCheckboxValue(
  habit: Habit,
  value: EntryValue | undefined,
  date: string,
): 0 | 1 | null {
  const next = !checkboxChecked(habit, value, date);
  return next === checkboxChecked(habit, undefined, date) ? null : next ? 1 : 0;
}
export function withCheckboxDefault(
  habit: Habit,
  from: string,
  checked: boolean,
  id: string,
): HabitGoal[] {
  const current = goalAt(habit, from);
  const goal: HabitGoal = {
    ...(current ?? {
      rule: defaultSuccessRule(habit),
      weekdays: [...allWeekdays],
    }),
    id,
    from,
    defaultChecked: checked,
  };
  return replaceGoal(habit.goals, resolveGoalDraft(habit.goals, goal, false));
}
