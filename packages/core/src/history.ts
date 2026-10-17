import { checkboxChecked } from './habitGoals.ts';
import { sameValue } from './storage/model.ts';
import { entryLabel } from './entries.ts';
import { localDateKey } from './calendar.ts';
import { habitType, isNumericHabit } from './habits.ts';
import { fillRange, fillSummary } from './entryFill.ts';
import type { HistoryAction, StoredState } from './storage/model.ts';
import type { IconName } from './iconNames.ts';

// Exclusive kinds for the History filter and day summaries. Notes are rows that
// read "Description edited/cleared" and open Before/After.
export type HistoryKind = 'entries' | 'edits' | 'notes';
export type HistoryFilter = {
  kind: HistoryKind | 'all';
  habitId: string | null;
};
export const allHistory: HistoryFilter = { kind: 'all', habitId: null };
export type HistoryCounts = Record<HistoryKind, number>;

// One contiguous run of actions recorded on the same local day, newest first.
export type HistoryDay = {
  // The oldest action keeps the key stable while newer actions arrive.
  key: string;
  date: string;
  actions: HistoryAction[];
  counts: HistoryCounts;
};

type DefinitionChange = Extract<HistoryAction['change'], { kind: 'habit' }>;

function isDescriptionEdit(change: DefinitionChange): boolean {
  return (
    !!change.before &&
    !!change.after &&
    change.before.description !== change.after.description &&
    sameValue(change.before.goals, change.after.goals)
  );
}

// Replay copies the stack but keeps earlier action objects, so each action's
// kind and local day are worked out once. Days reset when the zone changes.
const kinds = new WeakMap<HistoryAction, HistoryKind>();
let days = new WeakMap<HistoryAction, string>();
// Zone offsets change only on quarter hours, so each quarter hour's offset and
// each local day's key are computed once rather than per action.
let offsets = new Map<number, number>();
let dayKeys = new Map<number, string>();
let zone = '';
const quarterHour = 15 * 60 * 1000;
const dayLength = 24 * 60 * 60 * 1000;

// Equivalent to localDateKey(new Date(recordedAt)) for the current zone.
function localDay(recordedAt: string): string {
  const time = Date.parse(recordedAt);
  const quarter = Math.floor(time / quarterHour);
  let offset = offsets.get(quarter);
  if (offset === undefined) {
    if (offsets.size > 100_000) offsets = new Map();
    offset = new Date(time).getTimezoneOffset();
    offsets.set(quarter, offset);
  }
  const day = Math.floor((time - offset * 60_000) / dayLength);
  let key = dayKeys.get(day);
  if (key === undefined) {
    key = localDateKey(new Date(time));
    dayKeys.set(day, key);
  }
  return key;
}

export function historyKind(action: HistoryAction): HistoryKind {
  let kind = kinds.get(action);
  if (kind === undefined) {
    const change = action.change;
    kind =
      change.kind === 'entry' || change.kind === 'entries'
        ? 'entries'
        : change.kind === 'habit' && isDescriptionEdit(change)
          ? 'notes'
          : 'edits';
    kinds.set(action, kind);
  }
  return kind;
}

function historyDate(action: HistoryAction): string {
  let date = days.get(action);
  if (date === undefined) {
    date = localDay(action.recordedAt);
    days.set(action, date);
  }
  return date;
}

export function historyMatches(
  action: HistoryAction,
  filter: HistoryFilter,
): boolean {
  if (filter.kind !== 'all' && historyKind(action) !== filter.kind)
    return false;
  if (filter.habitId === null) return true;
  return (
    action.change.kind !== 'order' && action.change.habitId === filter.habitId
  );
}

// Keep the log's newest-first sequence, including when the device clock changes.
// A date may have another run if it recurs after a clock/time-zone adjustment.
// Paging stops between days, so every returned day is complete.
export function historyDays(
  actions: HistoryAction[],
  filter: HistoryFilter = allHistory,
  dayLimit = Infinity,
): { days: HistoryDay[]; more: boolean } {
  syncZone();
  const result: HistoryDay[] = [];
  let day: HistoryDay | undefined;
  for (let index = actions.length - 1; index >= 0; index--) {
    const action = actions[index];
    if (!historyMatches(action, filter)) continue;
    const date = historyDate(action);
    if (!day || day.date !== date) {
      if (result.length >= dayLimit) return { days: keyed(result), more: true };
      day = {
        key: '',
        date,
        actions: [],
        counts: { entries: 0, edits: 0, notes: 0 },
      };
      result.push(day);
    }
    day.actions.push(action);
    day.counts[historyKind(action)]++;
  }
  return { days: keyed(result), more: false };
}

function syncZone() {
  const current = `${Intl.DateTimeFormat().resolvedOptions().timeZone}|${new Date().getTimezoneOffset()}`;
  if (current !== zone) {
    zone = current;
    days = new WeakMap();
    offsets = new Map();
    dayKeys = new Map();
  }
}

// One local day in the History calendar: what changed, by the day each change
// was made (the same grouping as the day list).
export type HistoryCalendarDay = {
  date: string;
  count: number;
  counts: HistoryCounts;
  // Habits changed that day, most changes first (ties: most recent first).
  habits: { id: string; count: number }[];
  // Changes that belong to no habit (the habit order).
  other: number;
};
export type HistoryCalendar = {
  days: ReadonlyMap<string, HistoryCalendarDay>;
  // The first and last days with changes, or null without any.
  first: string | null;
  last: string | null;
};

// What each calendar shows, behind its info button.
export const historyCalendarInfo = {
  month:
    'Dots show the habits changed on each day you made changes, most changes first. Choose a day to see its changes.',
  year: 'Each dot is a day you made changes, in the colour of the habit changed most that day. Choose a month to open it, or a day to see its changes.',
} as const;

/**
 * Every day with matching changes, for the month and year calendars. It scans
 * the whole log, so call it only while a calendar is shown.
 */
export function historyCalendar(
  actions: HistoryAction[],
  filter: HistoryFilter = allHistory,
): HistoryCalendar {
  syncZone();
  const result = new Map<string, HistoryCalendarDay>();
  const order = new Map<string, Map<string, number>>();
  let first: string | null = null;
  let last: string | null = null;
  for (let index = actions.length - 1; index >= 0; index--) {
    const action = actions[index];
    if (!historyMatches(action, filter)) continue;
    const date = historyDate(action);
    let day = result.get(date);
    if (!day) {
      day = {
        date,
        count: 0,
        counts: { entries: 0, edits: 0, notes: 0 },
        habits: [],
        other: 0,
      };
      result.set(date, day);
      order.set(date, new Map());
      if (first === null || date < first) first = date;
      if (last === null || date > last) last = date;
    }
    day.count++;
    day.counts[historyKind(action)]++;
    if (action.change.kind === 'order') {
      day.other++;
      continue;
    }
    const seen = order.get(date)!;
    const id = action.change.habitId;
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  for (const [date, seen] of order) {
    // Map order is first seen, which is newest first; the sort is stable.
    result.get(date)!.habits = [...seen]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count);
  }
  return { days: result, first, last };
}

function keyed(result: HistoryDay[]): HistoryDay[] {
  for (const day of result) day.key = `${day.date}:${day.actions.at(-1)!.id}`;
  return result;
}

// The newest day on or before `date`, else the oldest day (for jumping).
export function historyDayIndex(days: HistoryDay[], date: string): number {
  const index = days.findIndex((day) => day.date <= date);
  return index < 0 ? days.length - 1 : index;
}

export function historyCountLabel(counts: HistoryCounts): string {
  const part = (count: number, one: string, many: string) =>
    count ? [`${count} ${count === 1 ? one : many}`] : [];
  return [
    ...part(counts.entries, 'entry', 'entries'),
    ...part(counts.edits, 'edit', 'edits'),
    ...part(counts.notes, 'note', 'notes'),
  ].join(' · ');
}

// Entries for the same date recorded close together read as one check-in.
export const burstGapMs = 5 * 60 * 1000;

export type HistoryRowItem =
  | {
      type: 'action';
      key: string;
      action: HistoryAction;
      // Position inside an expanded burst's card.
      nested?: 'middle' | 'last';
    }
  | {
      type: 'burst';
      // The oldest member stays fixed while newer entries join or are undone.
      key: string;
      actions: HistoryAction[];
      expanded: boolean;
    };

function joinsBurst(newer: HistoryAction, older: HistoryAction): boolean {
  return (
    newer.change.kind === 'entry' &&
    older.change.kind === 'entry' &&
    newer.change.date === older.change.date &&
    Math.abs(Date.parse(newer.recordedAt) - Date.parse(older.recordedAt)) <=
      burstGapMs
  );
}

// Merge only neighbouring actions, so bursts never reorder the log.
export function historyRows(
  actions: HistoryAction[],
  expanded: ReadonlySet<string>,
): HistoryRowItem[] {
  const rows: HistoryRowItem[] = [];
  let start = 0;
  while (start < actions.length) {
    let end = start + 1;
    while (end < actions.length && joinsBurst(actions[end - 1], actions[end]))
      end++;
    if (end - start === 1) {
      rows.push({
        type: 'action',
        key: actions[start].id,
        action: actions[start],
      });
    } else {
      const members = actions.slice(start, end);
      const key = `burst:${members.at(-1)!.id}`;
      const open = expanded.has(key);
      rows.push({ type: 'burst', key, actions: members, expanded: open });
      if (open)
        members.forEach((action, index) =>
          rows.push({
            type: 'action',
            key: action.id,
            action,
            nested: index === members.length - 1 ? 'last' : 'middle',
          }),
        );
    }
    start = end;
  }
  return rows;
}

// A compact name/value for one entry inside a collapsed burst.
export function burstMemberLabel(event: HistoryAction, state: StoredState) {
  const change = event.change;
  const row = historyPresentation(event, state);
  const habit =
    change.kind === 'entry'
      ? state.habits.find((habit) => habit.id === change.habitId)
      : undefined;
  const value =
    change.kind === 'entry' &&
    change.after !== null &&
    habit &&
    isNumericHabit(habit)
      ? `${change.after}${habit.unit ? ` ${habit.unit}` : ''}`
      : null;
  return {
    name: row.title,
    value,
    color: row.color,
    // Unchecked and cleared entries read as struck through.
    removed: row.icon === 'unchecked' || row.icon === 'erase',
    spoken: `${row.title} ${value ?? row.summary}`,
  };
}

// Habits that appear in active History, in current order then deleted ones.
export function historyHabits(
  state: StoredState,
  actions: HistoryAction[],
): StoredState['habits'] {
  const ids = new Set<string>();
  for (const action of actions)
    if (action.change.kind !== 'order') ids.add(action.change.habitId);
  return state.habits.filter((habit) => ids.has(habit.id));
}

export function historyDayLabel(date: string, today: string): string {
  const day = new Date(`${date}T12:00:00`);
  const yesterday = new Date(`${today}T12:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const fullDate = day.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
  });
  if (date === today) return `Today · ${fullDate}`;
  if (date === localDateKey(yesterday)) return `Yesterday · ${fullDate}`;
  return day.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
  });
}

// Keep names/types for older actions after deletion, without returning these
// habits or their records to the live grid/archive/statistics state.
export function historyDisplayState(
  state: StoredState,
  actions: HistoryAction[],
): StoredState {
  const habits = new Map(state.habits.map((habit) => [habit.id, habit]));
  for (let index = actions.length - 1; index >= 0; index--) {
    const change = actions[index].change;
    if (
      change.kind === 'deleteHabit' &&
      change.before &&
      !habits.has(change.habitId)
    )
      habits.set(change.habitId, change.before.habit);
  }
  return habits.size === state.habits.length
    ? state
    : { ...state, habits: [...habits.values()] };
}

export function historyPresentation(event: HistoryAction, state: StoredState) {
  const change = event.change;
  if (change.kind === 'order')
    return {
      title: 'Habit order',
      summary: 'Rearranged habits',
      icon: 'reorder' as const,
      color: '#ACB8C5',
      effectiveDate: null,
    };
  if (change.kind === 'deleteHabit') {
    const habit = (change.before ?? change.after)!.habit;
    return {
      title: habit.name,
      summary: 'Habit deleted',
      icon: 'erase' as const,
      color: habit.color,
      effectiveDate: null,
    };
  }
  if (change.kind === 'habit') {
    const habit = change.after ?? change.before!;
    const goalChanged =
      change.before &&
      change.after &&
      !sameValue(change.before.goals, change.after.goals);
    const summary = goalChanged
      ? 'Goals edited'
      : isDescriptionEdit(change)
        ? change.after?.description
          ? 'Description edited'
          : 'Description cleared'
        : !change.before
          ? 'Habit added'
          : !change.after
            ? 'Habit removed'
            : change.before.archived !== change.after.archived
              ? change.after.archived
                ? 'Archived'
                : 'Restored'
              : change.before.icon !== change.after.icon &&
                  change.before.name === change.after.name &&
                  change.before.color === change.after.color &&
                  change.before.unit === change.after.unit &&
                  change.before.startDate === change.after.startDate &&
                  change.before.description === change.after.description &&
                  habitType(change.before) === habitType(change.after) &&
                  sameValue(
                    change.before.categories,
                    change.after.categories,
                  ) &&
                  sameValue(change.before.goals, change.after.goals)
                ? change.after.icon
                  ? 'Icon changed'
                  : 'Icon removed'
                : 'Habit edited';
    return {
      title: habit.name,
      summary,
      icon: (summary === 'Archived' ? 'archive' : 'edit') as IconName,
      color: habit.color,
      effectiveDate: null,
    };
  }
  const habit = state.habits.find((habit) => habit.id === change.habitId);
  const title = habit?.name ?? 'Habit';
  if (change.kind === 'entries') {
    // One row per fill: what was set, how many days, and which days.
    const { summary, icon } = fillSummary(habit, change);
    const { from, to } = fillRange(change);
    return {
      title,
      summary: `${summary} · ${fillRangeLabel(from, to, event.recordedAt)}`,
      icon,
      color: habit?.color ?? '#ACB8C5',
      effectiveDate: null,
    };
  }
  let icon: IconName;
  let summary: string;
  if (change.kind === 'colour') {
    icon = 'palette';
    summary = 'Colour changed';
  } else if (habit && isNumericHabit(habit)) {
    icon = change.after === null ? 'erase' : 'number';
    const before =
      change.before === null
        ? '—'
        : `${change.before}${change.after === null && habit.unit ? ` ${habit.unit}` : ''}`;
    const after =
      change.after === null
        ? 'Cleared'
        : `${change.after}${habit.unit ? ` ${habit.unit}` : ''}`;
    summary = `${before} → ${after}`;
  } else if (habit && habitType(habit) !== 'checkbox') {
    icon =
      change.after === null
        ? 'erase'
        : habit.type === 'categorical'
          ? 'categories'
          : 'text';
    const compact = (value: typeof change.before) => {
      const label = entryLabel(habit, value).replace(/\s+/g, ' ');
      return label.length > 55 ? label.slice(0, 54) + '…' : label;
    };
    summary = `${compact(change.before)} → ${change.after === null ? 'Cleared' : compact(change.after)}`;
  } else {
    const checked = habit
      ? checkboxChecked(habit, change.after ?? undefined, change.date)
      : change.after === 1;
    icon = checked ? 'checked' : 'unchecked';
    summary = checked ? 'Checked' : 'Unchecked';
  }
  const recordedDay = localDateKey(new Date(event.recordedAt));
  const effectiveDate =
    change.kind === 'entry' && change.date !== recordedDay ? change.date : null;
  return {
    title,
    summary,
    icon,
    color: habit?.color ?? '#ACB8C5',
    effectiveDate,
  };
}

// "6–10 Oct" where the platform formats ranges, else "6 Oct – 10 Oct"; the
// year appears only when the range is outside the year it was recorded in.
export function fillRangeLabel(
  from: string,
  to: string,
  recordedAt: string,
): string {
  const year = String(new Date(recordedAt).getFullYear());
  const format = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    ...(from.slice(0, 4) !== year || to.slice(0, 4) !== year
      ? { year: 'numeric' }
      : {}),
  });
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  return typeof format.formatRange === 'function'
    ? format.formatRange(start, end)
    : `${format.format(start)} – ${format.format(end)}`;
}
