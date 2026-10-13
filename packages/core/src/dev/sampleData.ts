import { withSampleTiming } from './sampleTiming.ts';
import { withSampleRecords } from './sampleRecords.ts';
import { withSampleGoals } from './sampleGoals.ts';
import { sampleDescriptions } from './sampleDescriptions.ts';
import { calendarDay, localDateKey } from '../calendar.ts';
import { demoHabits, isNumericHabit } from '../habits.ts';
import {
  applyEvent,
  replayEvents,
  type EventMeta,
  type StoredEvent,
} from '../storage/model.ts';
import type { Repository } from '../storage/repository.ts';
import { ChangeStore } from '../storage/store.ts';

export const SAMPLE_DAYS = 180;
function hash(text: string): number {
  let value = 2166136261;
  for (const character of text)
    value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
}
function meta(sequence: number, date: Date, prefix: string): EventMeta {
  return {
    version: 7,
    sequence,
    id: `${prefix}_${sequence}`,
    recordedAt: date.toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
    utcOffsetMinutes: -date.getTimezoneOffset(),
  };
}
// Typical local minute and +/- spread for each preset, so time-of-day charts
// show plausible shapes. Morning habits shift an hour later at weekends.
const SAMPLE_TIMES: Record<string, [number, number, boolean?]> = {
  walk: [7 * 60 + 15, 30, true],
  read: [21 * 60 + 30, 45],
  water: [9 * 60 + 30, 90],
  stretch: [7 * 60, 30, true],
  journal: [22 * 60, 30],
  outside: [13 * 60, 120],
  meditate: [6 * 60 + 45, 20, true],
  cook: [18 * 60 + 45, 40],
  tidy: [20 * 60, 60],
  connect: [19 * 60, 120],
  learn: [20 * 60 + 30, 60],
  sleep: [22 * 60 + 30, 30],
};
function sampleMinute(habitId: string, key: string, weekend: boolean) {
  const [centre, spread, morning] = SAMPLE_TIMES[habitId] ?? [9 * 60, 60];
  const noise = hash(`${habitId}:${key}:time`);
  // Some walks happen after work instead of before it.
  const evening = habitId === 'walk' && noise % 3 === 0 ? 11 * 60 : 0;
  const offset = Math.round(((noise % 1001) / 500 - 1) * spread);
  return Math.max(
    5 * 60,
    Math.min(
      23 * 60 + 50,
      centre + evening + offset + (morning && weekend ? 60 : 0),
    ),
  );
}
// Synthetic history only: never receives real values or a persistent repository.
export function createSampleEvents(today: string): StoredEvent[] {
  const started = calendarDay(today, SAMPLE_DAYS - 1);
  started.setHours(8, 0, 0, 0);
  const events: StoredEvent[] = [
    {
      ...meta(1, started, 'sample_seed'),
      type: 'initialize',
      habits: demoHabits.map((habit) => ({
        ...habit,
        description: sampleDescriptions[habit.id],
      })),
    },
  ];
  for (let ago = SAMPLE_DAYS - 1; ago >= 0; ago--) {
    const date = calendarDay(today, ago);
    const key = localDateKey(date);
    const progress = (SAMPLE_DAYS - 1 - ago) / (SAMPLE_DAYS - 1);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const day: { minute: number; habitId: string; value: number }[] = [];
    for (const [index, habit] of demoHabits.entries()) {
      const noise = hash(`${habit.id}:${key}`);
      let value: number;
      if (isNumericHabit(habit)) {
        // Include both unrecorded days and explicitly recorded zeros.
        if (
          ago === 11 ||
          (ago > 4 && noise % 7 === 0) ||
          (ago === 0 && habit.id === 'water')
        )
          continue;
        value =
          ago === 10 || noise % 23 === 0
            ? 0
            : habit.id === 'read'
              ? 5 *
                (2 + Math.floor(progress * 5) + (noise % 5) + (weekend ? 2 : 0))
              : 3 + (noise % 12) / 2;
      } else {
        const improving = habit.id === 'stretch' || habit.id === 'learn';
        const threshold = improving
          ? 30 + progress * 55
          : habit.id === 'journal'
            ? 80 - progress * 35
            : habit.id === 'outside' || habit.id === 'cook'
              ? weekend
                ? 90
                : 55
              : habit.id === 'connect'
                ? weekend
                  ? 70
                  : 30
                : 62 + (index % 3) * 8;
        const recentWalk = habit.id === 'walk' && ago <= 7;
        const meditationGap = habit.id === 'meditate' && ago <= 2;
        if (
          !recentWalk &&
          (meditationGap ||
            noise % 100 >= threshold ||
            (ago === 0 && index % 3 !== 0))
        )
          continue;
        value = 1;
      }
      day.push({
        minute: sampleMinute(habit.id, key, weekend),
        habitId: habit.id,
        value,
      });
    }
    // Keep each day's edits in time order so History reads naturally.
    day.sort((left, right) => left.minute - right.minute);
    for (const { minute, habitId, value } of day) {
      date.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
      const metadata = meta(events.length + 1, date, 'sample_entry');
      events.push({
        ...metadata,
        type: 'change',
        groupId: metadata.id,
        change: {
          kind: 'entry',
          habitId,
          date: key,
          before: null,
          after: value,
        },
      });
    }
  }
  return events;
}

// An entirely separate in-memory store exercises the normal grid, history,
// stats and Undo/Redo code. No SQLite, files, localStorage or backup replacement.
export async function createSampleStore(today: string): Promise<ChangeStore> {
  let { events, replay } = replayEvents(
    withSampleTiming(
      withSampleGoals(
        withSampleRecords(createSampleEvents(today), today),
        today,
      ),
      today,
    ),
  );
  const repository: Repository = {
    async load() {
      return { ...replayEvents(events), hasRecovery: false };
    },
    async append(event, state) {
      const next = applyEvent(replay, event);
      if (JSON.stringify(next.state) !== JSON.stringify(state))
        throw new Error('Sample projection mismatch.');
      events = [...events, event];
      replay = next;
    },
    async replace() {
      throw new Error('Backup restore is unavailable in sample mode.');
    },
    async recoveryEvents() {
      throw new Error('Sample mode has no recovery archive.');
    },
  };
  const store = new ChangeStore(repository, (sequence) =>
    meta(sequence, new Date(), 'sample_edit'),
  );
  await store.load();
  if (store.getSnapshot().status !== 'ready')
    throw new Error('Sample data could not be opened.');
  return store;
}
