// A habit's own statistics page (storage v25): which sections show, in what
// order, and how a number habit combines its days. Pure and shared by both
// apps; storage validates the saved shape with isStatsLayout.
import { habitType, type Habit, type HabitType } from './habits.ts';
import { sameValue } from './storage/changeUtils.ts';
import type { StatsLayoutChange, StoredState } from './storage/types.ts';

export type StatsSectionId =
  | 'values'
  | 'success'
  | 'streaks'
  | 'categories'
  | 'calendar'
  | 'weekday'
  | 'timeOfDay';
/** Every section in its default order. */
export const STATS_SECTION_IDS: readonly StatsSectionId[] = [
  'values',
  'success',
  'streaks',
  'categories',
  'calendar',
  'weekday',
  'timeOfDay',
];
/**
 * How a number habit's days combine into one figure for a period, a week or
 * a weekday. Total adds them up, counting blank days as zero; the others
 * read each recorded day as a reading and leave blank days out.
 */
export type NumberCombine = 'total' | 'average' | 'highest' | 'lowest';
export const NUMBER_COMBINES: readonly NumberCombine[] = [
  'total',
  'average',
  'highest',
  'lowest',
];
export type StatsLayout = {
  /** Sections in the chosen order; missing ones follow in default order. */
  order?: StatsSectionId[];
  hidden?: StatsSectionId[];
  combine?: NumberCombine;
};

const SECTIONS_BY_TYPE: Record<HabitType, readonly StatsSectionId[]> = {
  checkbox: ['success', 'streaks', 'calendar', 'weekday', 'timeOfDay'],
  number: ['values', 'success', 'streaks', 'calendar', 'weekday', 'timeOfDay'],
  categorical: ['success', 'streaks', 'categories', 'calendar', 'timeOfDay'],
  text: ['success', 'streaks', 'calendar', 'timeOfDay'],
};

export const statsSectionTitle = (
  id: StatsSectionId,
  habit: Habit,
  layout?: StatsLayout | null,
) =>
  ({
    values: habitType(habit) === 'number' ? valuesTitle(layout) : 'Values',
    success: 'Success over time',
    streaks: 'Streaks',
    categories: 'Categories',
    calendar: 'Calendar',
    weekday: 'By day of the week',
    timeOfDay: 'Time of day',
  })[id];

const valuesTitle = (layout?: StatsLayout | null) =>
  numberCombine(layout) === 'total' ? 'Daily totals' : 'Daily values';

export const numberCombine = (layout?: StatsLayout | null): NumberCombine =>
  layout?.combine ?? 'total';

export const numberCombineLabel = (combine: NumberCombine) =>
  ({
    total: 'Total',
    average: 'Average',
    highest: 'Highest',
    lowest: 'Lowest',
  })[combine];

/** One line explaining each choice, for the edit sheet. */
export const numberCombineHint = (combine: NumberCombine) =>
  ({
    total: 'Days add up, like pages or minutes. Blank days count as zero.',
    average:
      'Each day is a reading, like sleep, weight or mood. Blank days are left out.',
    highest: 'The highest day counts, like a personal best.',
    lowest: 'The lowest day counts, like a fastest time.',
  })[combine];

/** The sections a habit's type can show, in its saved order, with visibility. */
export function statsSections(
  habit: Habit,
  layout?: StatsLayout | null,
): { id: StatsSectionId; hidden: boolean }[] {
  const available = SECTIONS_BY_TYPE[habitType(habit)];
  const chosen = (layout?.order ?? []).filter((id) => available.includes(id));
  const ordered = [
    ...chosen,
    ...available.filter((id) => !chosen.includes(id)),
  ];
  const hidden = new Set(layout?.hidden ?? []);
  return ordered.map((id) => ({ id, hidden: hidden.has(id) }));
}

/** Only the sections to draw, in order. */
export const visibleStatsSections = (
  habit: Habit,
  layout?: StatsLayout | null,
) =>
  statsSections(habit, layout)
    .filter((section) => !section.hidden)
    .map((section) => section.id);

/**
 * The layout to save after an edit: default values are dropped so a page
 * left as it started saves nothing, and an empty layout is null.
 */
export function normalizeStatsLayout(
  habit: Habit,
  layout: StatsLayout,
): StatsLayout | null {
  const available = SECTIONS_BY_TYPE[habitType(habit)];
  const defaultOrder = available.join(),
    order = statsSections(habit, layout).map((section) => section.id);
  // Keep sections other types own (a habit can change type and back).
  const foreignOrder = (layout.order ?? []).filter(
    (id) => !available.includes(id),
  );
  const hidden = [...new Set(layout.hidden ?? [])].filter((id) =>
    STATS_SECTION_IDS.includes(id),
  );
  const next: StatsLayout = {};
  if (order.join() !== defaultOrder || foreignOrder.length)
    next.order = [...order, ...foreignOrder];
  if (hidden.length) next.hidden = hidden;
  if (layout.combine && layout.combine !== 'total')
    next.combine = layout.combine;
  return Object.keys(next).length ? next : null;
}

/** Move one section up (-1) or down (+1) among the habit's sections. */
export function moveStatsSection(
  habit: Habit,
  layout: StatsLayout | null | undefined,
  id: StatsSectionId,
  step: -1 | 1,
): StatsLayout {
  const order = statsSections(habit, layout).map((section) => section.id),
    from = order.indexOf(id),
    to = from + step;
  if (from < 0 || to < 0 || to >= order.length) return { ...layout };
  order.splice(from, 1);
  order.splice(to, 0, id);
  return { ...layout, order };
}

export function setStatsSectionHidden(
  layout: StatsLayout | null | undefined,
  id: StatsSectionId,
  hidden: boolean,
): StatsLayout {
  const current = (layout?.hidden ?? []).filter((item) => item !== id);
  return { ...layout, hidden: hidden ? [...current, id] : current };
}

const isSectionList = (value: unknown): value is StatsSectionId[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.length <= STATS_SECTION_IDS.length &&
  new Set(value).size === value.length &&
  value.every((id) => STATS_SECTION_IDS.includes(id as StatsSectionId));

/** Strict saved shape: known fields only, never an empty layout. */
export function isStatsLayout(value: unknown): value is StatsLayout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>,
    keys = Object.keys(record);
  return (
    keys.length > 0 &&
    keys.every(
      (key) => key === 'order' || key === 'hidden' || key === 'combine',
    ) &&
    (record.order === undefined || isSectionList(record.order)) &&
    (record.hidden === undefined || isSectionList(record.hidden)) &&
    (record.combine === undefined ||
      NUMBER_COMBINES.includes(record.combine as NumberCombine))
  );
}

/**
 * The preference change that saves an edited layout (null: the default),
 * reading its before-value from the current state; null when nothing
 * changes.
 */
export function statsLayoutChange(
  state: StoredState,
  habit: Habit,
  layout: StatsLayout | null,
): StatsLayoutChange | null {
  const before = state.statsLayouts?.[habit.id] ?? null;
  const after = layout && normalizeStatsLayout(habit, layout);
  return sameValue(before, after)
    ? null
    : { kind: 'statsLayout', habitId: habit.id, before, after };
}
