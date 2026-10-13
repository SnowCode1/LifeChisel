import { periodStatistics } from './periodStatistics.ts';
import type { EntryValue, EntryValues } from './entries.ts';
import type { Habit } from './habits.ts';
import type { StoredEvent } from './storage/model.ts';
import {
  completionStatistics,
  summarizeCompletion,
} from './completionStatistics.ts';
import {
  dayNumber,
  dateKey,
  habitTrackingStart,
  type StatsRange,
  type StatsBucket,
} from './statistics.ts';

export function recordStatistics(
  habit: Habit,
  values: EntryValues,
  events: StoredEvent[],
  today: string,
  range: StatsRange,
  // A stepped-back window; streaks and goals still describe today.
  endKey: string = today,
) {
  const trackingStart = habitTrackingStart(habit, values, events, today);
  const first = dayNumber(trackingStart),
    now = dayNumber(today),
    end = Math.min(now, dayNumber(endKey));
  const start = range === 'all' ? Math.min(first, end) : end - range + 1;
  const completion = completionStatistics(
    habit,
    values,
    trackingStart,
    today,
    dateKey(start),
  );
  const all = Object.entries(values)
    .filter(([key]) => key.startsWith(`${habit.id}:`))
    .map(([key, value]) => ({ date: key.slice(habit.id.length + 1), value }))
    .filter((item) => item.date >= trackingStart && item.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));
  const records = all.filter(
    (item) => dayNumber(item.date) >= start && dayNumber(item.date) <= end,
  );
  const eligible = Math.max(0, end - Math.max(start, first) + 1);
  let streak = 0,
    expected = all[0]?.date === today ? now : now - 1;
  for (const item of all) {
    if (dayNumber(item.date) !== expected) break;
    streak++;
    expected--;
  }
  let bestStreak = 0,
    run = 0,
    previous = -Infinity;
  for (const item of [...all].reverse()) {
    const day = dayNumber(item.date);
    run = day === previous + 1 ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    previous = day;
  }
  const bucketDays =
    end - start + 1 <= 90 ? 7 : Math.ceil((end - start + 1) / 24);
  const buckets: StatsBucket[] = [];
  for (let from = start; from <= end; from += bucketDays) {
    const to = Math.min(end, from + bucketDays - 1);
    const days = Math.max(0, to - Math.max(from, first) + 1);
    const count = records.filter((item) => {
      const day = dayNumber(item.date);
      return day >= from && day <= to;
    }).length;
    buckets.push({
      start: dateKey(from),
      end: dateKey(to),
      value: days ? (count / days) * 100 : null,
      recorded: count,
      eligible: days,
    });
  }
  const categories =
    habit.categories?.map((option) => ({
      ...option,
      count: records.filter(
        (item) => Array.isArray(item.value) && item.value.includes(option.id),
      ).length,
    })) ?? [];
  return {
    trackingStart,
    periodGoals: periodStatistics(
      habit,
      values,
      trackingStart,
      today,
      dateKey(start),
    ),
    // Goal totals for the selected window; streaks and data still use today.
    completion: {
      ...completion,
      ...summarizeCompletion(completion, dateKey(start), dateKey(end)),
    },
    start: dateKey(start),
    end: dateKey(end),
    eligible,
    recorded: records.length,
    records,
    categories,
    buckets,
    streak,
    bestStreak,
    lastRecorded: all[0]?.date ?? null,
  };
}
export type DailyRecord = { date: string; value: EntryValue };
