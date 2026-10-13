import { periodStatistics } from './periodStatistics.ts';
import type { EntryValues } from './entries.ts';
import type { WeekStart } from './displayPreferences.ts';
import { isNumericHabit, type Habit } from './habits.ts';
import {
  completionStatistics,
  summarizeCompletion,
} from './completionStatistics.ts';
import type { StoredEvent } from './storage/model.ts';

const DAY = 86400000;
export const dayNumber = (date: string) =>
  Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY);
export const dateKey = (day: number) =>
  new Date(day * DAY).toISOString().slice(0, 10);
export type StatsRange = 30 | 90 | 365 | 'all';
export type StatsBucket = {
  start: string;
  end: string;
  value: number | null;
  recorded: number;
  eligible: number;
};
function editDay(event: StoredEvent) {
  return Math.floor(
    (Date.parse(event.recordedAt) + event.utcOffsetMinutes * 60000) / DAY,
  );
}
// Each habit's own start bounds a continuous calendar period. Activity in
// another row, a blank day, and archive/restore never change its denominator.
function habitStart(
  habit: Habit,
  events: StoredEvent[],
  today: number,
  firstEntry: number,
) {
  if (habit.startDate) return dayNumber(habit.startDate);
  const creation = events.find((event) =>
    event.type === 'initialize'
      ? event.habits.some((item) => item.id === habit.id)
      : event.change.kind === 'habit' &&
        event.change.habitId === habit.id &&
        event.change.before === null &&
        event.change.after !== null,
  );
  return Math.min(creation ? editDay(creation) : today, firstEntry);
}
// Legacy habits acquire a display default without rewriting their event log.
export function habitTrackingStart(
  habit: Habit,
  values: EntryValues,
  events: StoredEvent[],
  todayKey: string,
) {
  if (habit.startDate) return habit.startDate;
  const today = dayNumber(todayKey),
    prefix = `${habit.id}:`;
  let firstEntry = Infinity;
  for (const key of Object.keys(values)) {
    if (!key.startsWith(prefix)) continue;
    const day = dayNumber(key.slice(prefix.length));
    if (day <= today) firstEntry = Math.min(firstEntry, day);
  }
  return dateKey(Math.min(today, habitStart(habit, events, today, firstEntry)));
}
function countWeekday(start: number, end: number, weekday?: number) {
  if (end < start) return 0;
  if (weekday === undefined) return end - start + 1;
  const first = start + ((weekday - ((((start + 4) % 7) + 7) % 7) + 7) % 7);
  return first > end ? 0 : Math.floor((end - first) / 7) + 1;
}
export function habitStatistics(
  habit: Habit,
  values: EntryValues,
  events: StoredEvent[],
  todayKey: string,
  range: StatsRange,
  // The selected window can step back in time; streaks, goals and the
  // tracking start still describe today.
  endKey: string = todayKey,
) {
  const today = dayNumber(todayKey),
    end = Math.min(today, dayNumber(endKey)),
    numeric = isNumericHabit(habit),
    prefix = `${habit.id}:`,
    explicitStart = habit.startDate ? dayNumber(habit.startDate) : -Infinity;
  const records = Object.entries(values)
    .filter(
      (entry): entry is [string, number] =>
        entry[0].startsWith(prefix) && typeof entry[1] === 'number',
    )
    .map(([key, value]) => ({
      day: dayNumber(key.slice(prefix.length)),
      value,
    }))
    .filter((item) => item.day <= today && item.day >= explicitStart)
    .sort((a, b) => a.day - b.day);
  const trackingStart = habitStart(
    habit,
    events,
    today,
    records[0]?.day ?? Infinity,
  );
  const start =
    range === 'all' ? Math.min(today, trackingStart) : end - range + 1;
  const completion = completionStatistics(
    habit,
    values,
    dateKey(trackingStart),
    todayKey,
    dateKey(start),
  );
  function summarize(from: number, to: number, weekday?: number) {
    const matching = records.filter(
      (item) =>
        item.day >= from &&
        item.day <= to &&
        (weekday === undefined ||
          new Date(item.day * DAY).getUTCDay() === weekday),
    );
    const eligible = countWeekday(
      Math.max(from, trackingStart),
      Math.min(to, today),
      weekday,
    );
    const goalSummary = summarizeCompletion(
      completion,
      dateKey(from),
      dateKey(to),
      weekday,
    );
    const successes = numeric
      ? matching.filter((item) => item.value === 1).length
      : goalSummary.successes;
    const total = matching.reduce((sum, item) => sum + item.value, 0);
    return {
      recorded: matching.length,
      eligible: numeric ? eligible : goalSummary.eligible,
      successes,
      total,
      rate: numeric
        ? eligible
          ? successes / eligible
          : null
        : goalSummary.rate,
      average: eligible ? total / eligible : null,
      best: matching.length
        ? matching.reduce((best, item) => Math.max(best, item.value), 0)
        : null,
    };
  }
  const summary = summarize(start, end);
  const span = end - start + 1;
  const previous = summarize(start - span, start - 1);
  const bucketDays = numeric
    ? span <= 30
      ? 1
      : span <= 90
        ? 7
        : Math.ceil(span / 24)
    : span <= 90
      ? 7
      : Math.ceil(span / 24);
  const buckets: StatsBucket[] = [];
  for (let from = start; from <= end; from += bucketDays) {
    const to = Math.min(end, from + bucketDays - 1),
      part = summarize(from, to);
    buckets.push({
      start: dateKey(from),
      end: dateKey(to),
      value: numeric
        ? part.recorded
          ? part.total
          : null
        : part.rate === null
          ? null
          : part.rate * 100,
      recorded: part.recorded,
      eligible: part.eligible,
    });
  }
  const weekday = Array.from({ length: 7 }, (_, index) => {
    const day = (index + 1) % 7,
      part = summarize(start, end, day);
    return {
      day,
      value: numeric
        ? part.average
        : part.rate === null
          ? null
          : part.rate * 100,
      recorded: part.recorded,
      eligible: part.eligible,
    };
  });
  const completed = records.filter((item) => numeric || item.value === 1);
  let bestStreak = 0,
    run = 0,
    previousDay = -Infinity;
  for (const item of completed) {
    run = item.day === previousDay + 1 ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    previousDay = item.day;
  }
  let streak = 0,
    expected = completed.at(-1)?.day === today ? today : today - 1;
  for (
    let index = completed.length - 1;
    index >= 0 && completed[index].day === expected;
    index--, expected--
  )
    streak++;
  return {
    numeric,
    periodGoals: periodStatistics(
      habit,
      values,
      dateKey(trackingStart),
      todayKey,
      dateKey(start),
    ),
    // Goal totals for the selected window; streaks and data still use today.
    completion: {
      ...completion,
      ...summarizeCompletion(completion, dateKey(start), dateKey(end)),
    },
    start: dateKey(start),
    end: dateKey(end),
    today: todayKey,
    trackingStart: dateKey(
      habit.startDate ? trackingStart : Math.min(today, trackingStart),
    ),
    ...summary,
    previous,
    buckets,
    bucketDays,
    weekday,
    streak: numeric && !completion.active ? streak : completion.streak,
    bestStreak:
      numeric && !completion.active ? bestStreak : completion.bestStreak,
    allRecorded: records.length,
    lastRecorded: records.length ? dateKey(records.at(-1)!.day) : null,
  };
}
export function monthDays(month: string, weekStart: WeekStart = 'monday') {
  const first = dayNumber(`${month}-01`),
    date = new Date(first * DAY);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const count = Math.round(date.getTime() / DAY) - first;
  return {
    padding:
      (new Date(first * DAY).getUTCDay() + (weekStart === 'monday' ? 6 : 0)) %
      7,
    days: Array.from({ length: count }, (_, index) => dateKey(first + index)),
  };
}
