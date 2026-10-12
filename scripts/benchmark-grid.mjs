// Synthetic CPU microbenchmarks, not native frame-rate or disk-durability tests.
import { performance } from 'node:perf_hooks';
import { demoHabits } from '../src/habits.ts';
import { colorOnBlack } from '../src/colors.ts';
import { createGridPalette } from '../src/gridAppearance.ts';
import {
  calendarDay,
  localDateKey,
  createGridDayCache,
} from '../src/calendar.ts';
import { ChangeStore } from '../src/storage/store.ts';
import { replayEvents, applyEvent } from '../src/storage/model.ts';
import { entrySelection } from '../src/storage/selection.ts';

const today = '2026-10-04';
function summary(samples) {
  samples.sort((a, b) => a - b);
  return {
    medianMs: +samples[Math.floor(samples.length * 0.5)].toFixed(3),
    p95Ms: +samples[Math.floor(samples.length * 0.95)].toFixed(3),
  };
}
function bench(operation, setup = () => undefined, count = 60) {
  const samples = [];
  for (let i = 0; i < count + 5; i++) {
    const state = setup();
    const start = performance.now();
    operation(state);
    const elapsed = performance.now() - start;
    if (i >= 5) samples.push(elapsed);
  }
  return summary(samples);
}
function legacyDates(count) {
  return Array.from({ length: count }, (_, ago) => {
    const date = calendarDay(today, ago);
    return {
      key: localDateKey(date),
      daysAgo: ago,
      label:
        ago === 0
          ? 'Today'
          : date.toLocaleDateString(undefined, { weekday: 'short' }),
      number: date.getDate(),
      fullLabel: date.toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    };
  });
}
const palettes = demoHabits.map((habit) => createGridPalette(habit.color));
let guard = 0;
const coloursBefore = () => {
  for (let day = 0; day < 24; day++)
    for (const habit of demoHabits) {
      guard += colorOnBlack(habit.color, 170 / 255).length;
      guard += colorOnBlack(habit.color, 0.65).length;
      guard += habit.color.length;
    }
};
const coloursAfter = () => {
  for (let day = 0; day < 24; day++)
    for (const palette of palettes)
      guard +=
        palette.checkbox.length + palette.number.length + palette.rule.length;
};
console.log(
  'Desktop Node CPU timings; do not interpret as iPhone frame timings.',
);
console.table({
  '288 cells: previous colour calculations': bench(coloursBefore),
  '288 cells: cached palette reads': bench(coloursAfter),
  '540 dates: previous rebuild': bench(() => legacyDates(540), undefined, 25),
  '450→540 dates: reuse existing, format 90': bench(
    (cache) => cache(540),
    () => {
      const cache = createGridDayCache(today);
      cache(450);
      return cache;
    },
    25,
  ),
});
// A synthetic memory repository intentionally retains the same projection
// validation as sample mode: these costs have not been optimised in this pass.
async function storeBenchmark(days) {
  const habits = Array.from({ length: 20 }, (_, i) => ({
    ...demoHabits[i % demoHabits.length],
    id: `habit_${i}`,
  }));
  const meta = (sequence) => ({
    version: 4,
    sequence,
    id: `bench_${sequence}`,
    recordedAt: '2026-10-04T12:00:00.000Z',
    timeZone: 'UTC',
    utcOffsetMinutes: 0,
  });
  const events = [{ ...meta(1), type: 'initialize', habits }];
  for (let ago = days - 1; ago >= 0; ago--) {
    const day = localDateKey(calendarDay(today, ago));
    for (const [i, habit] of habits.entries()) {
      if ((ago + i) % 3 === 0) continue;
      const metadata = meta(events.length + 1);
      events.push({
        ...metadata,
        type: 'change',
        groupId: metadata.id,
        change: {
          kind: 'entry',
          habitId: habit.id,
          date: day,
          before: null,
          after: 1,
        },
      });
    }
  }
  let replay = replayEvents(events).replay;
  const repository = {
    load: async () => ({ events, replay, hasRecovery: false }),
    append: async (event, state) => {
      const next = applyEvent(replay, event);
      if (JSON.stringify(next.state) !== JSON.stringify(state))
        throw new Error('Projection mismatch');
      replay = next;
    },
    replace: async () => {
      throw new Error('Not used');
    },
    recoveryEvents: async () => [],
  };
  const store = new ChangeStore(repository, meta);
  await store.load();
  let cellNotifications = 0;
  const unsubscribe = [];
  for (let ago = 0; ago < 24; ago++)
    for (const habit of habits) {
      const selection = entrySelection(
        store,
        `${habit.id}:${localDateKey(calendarDay(today, ago))}`,
      );
      unsubscribe.push(selection.subscribe(() => cellNotifications++));
    }
  const samples = [];
  for (let i = 0; i < 40; i++) {
    const before =
      store.getSnapshot().replay.state.values[`habit_0:${today}`] ?? null;
    const start = performance.now();
    store.change({
      kind: 'entry',
      habitId: 'habit_0',
      date: today,
      before,
      after: before === 1 ? null : 1,
    });
    await store.flush();
    samples.push(performance.now() - start);
  }
  unsubscribe.forEach((stop) => stop());
  return {
    days,
    habits: habits.length,
    events: events.length,
    ...summary(samples),
    mountedCells: 480,
    edits: 40,
    cellNotifications,
  };
}
console.table([await storeBenchmark(180), await storeBenchmark(1825)]);
if (!guard) throw new Error('Benchmark did not execute');
