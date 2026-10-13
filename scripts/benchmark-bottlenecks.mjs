// Fictional data only. Node SQLite/CPU timings do not establish phone latency.
import { DatabaseSync } from 'node:sqlite';
import { Buffer } from 'node:buffer';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  calendarDay,
  localDateKey,
  createGridDayCache,
} from '../packages/core/src/calendar.ts';
import { entrySelection } from '../packages/core/src/storage/selection.ts';
import {
  checkboxChecked,
  evaluateGoal,
} from '../packages/core/src/habitGoals.ts';
import { performanceFixture, nodeSqlPort } from './performance-fixture.mjs';
const today = '2026-10-07';
const directory = mkdtempSync(join(tmpdir(), 'onpurpose-grid-benchmark-'));
function eventsFor(days, notes) {
  const meta = (sequence) => ({
    version: 17,
    sequence,
    id: `fixture_${sequence}`,
    recordedAt: '2026-10-07T00:00:00.000Z',
    timeZone: 'UTC',
    utcOffsetMinutes: 0,
  });
  const habits = Array.from({ length: 20 }, (_, i) => ({
    id: `habit_${i}`,
    name: `Fictional habit ${i + 1}`,
    color: '#82E6BC',
    type: i < 14 ? 'checkbox' : 'number',
    startDate: localDateKey(calendarDay(today, days)),
    ...(notes && i < 3
      ? { description: 'Fictional motivation and reminders.\n\n'.repeat(250) }
      : {}),
  }));
  const events = [{ ...meta(1), type: 'initialize', habits }];
  for (let ago = days; ago > 0; ago--) {
    const date = localDateKey(calendarDay(today, ago));
    for (const [index, habit] of habits.entries()) {
      if ((ago + index) % 3 === 0) continue;
      const m = meta(events.length + 1);
      events.push({
        ...m,
        type: 'change',
        groupId: m.id,
        change: {
          kind: 'entry',
          habitId: habit.id,
          date,
          before: null,
          after: habit.type === 'checkbox' ? 1 : (ago + index) % 60,
        },
      });
    }
  }
  return events;
}
function distribution(samples) {
  samples.sort((a, b) => a - b);
  return {
    medianMs: +samples[Math.floor(samples.length / 2)].toFixed(3),
    p95Ms: +samples[Math.floor(samples.length * 0.95)].toFixed(3),
  };
}
async function run(days, notes) {
  const f = performanceFixture(),
    events = eventsFor(days, notes);
  const raw = new DatabaseSync(join(directory, `fixture-${days}.db`));
  try {
    const repo = f.sqliteRepository(nodeSqlPort(raw), () => events[0]);
    await repo.load();
    await repo.replace(events, 'fixture_recovery', '2026-10-07T00:00:00.000Z');
    let sequence = events.length;
    const { type: _type, habits: _habits, ...initialMeta } = events[0];
    const store = new f.ChangeStore(repo, (n) => ({
      ...initialMeta,
      sequence: n,
      id: `edit_${++sequence}`,
    }));
    f.timing.performanceRun.start('normal', 'web', 'saved');
    f.advance(2100);
    await store.load();
    const load = f.timing.performanceRun.stop();
    const daysToRender = createGridDayCache(today)(48);
    f.timing.performanceRun.start('normal', 'web', 'saved');
    f.advance(2100);
    const reads = [];
    for (let iteration = 0; iteration < 25; iteration++) {
      const start = performance.now();
      const state = store.getSnapshot().replay.state;
      for (const day of daysToRender)
        for (const habit of state.habits) {
          const value = entrySelection(
            store,
            `${habit.id}:${day.key}`,
          ).getSnapshot();
          if (habit.type === 'checkbox') checkboxChecked(habit, value, day.key);
          evaluateGoal(habit, value, day.key);
        }
      reads.push(performance.now() - start);
    }
    const reading = f.timing.performanceRun.stop();
    const stops = [];
    for (const day of daysToRender)
      for (const habit of store.getSnapshot().replay.state.habits)
        stops.push(
          entrySelection(store, `${habit.id}:${day.key}`).subscribe(() => {}),
        );
    f.timing.performanceRun.start('normal', 'web', 'saved');
    f.advance(2100);
    const edits = [];
    for (let i = 0; i < 20; i++) {
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
      edits.push(performance.now() - start);
    }
    const writing = f.timing.performanceRun.stop();
    stops.forEach((stop) => stop());
    return {
      days,
      notes,
      habitCount: 20,
      eventCount: events.length,
      projectedJsonBytes: Buffer.byteLength(
        JSON.stringify(store.getSnapshot().replay.state),
      ),
      load: load.metrics,
      read960CellModels: distribution(reads),
      readSqlCalls:
        (reading.metrics['sql.read']?.count ?? 0) +
        (reading.metrics['sql.write']?.count ?? 0),
      editAndFlush: distribution(edits),
      edits: writing.metrics,
    };
  } finally {
    raw.close();
  }
}
try {
  const results = {
    environment:
      'Desktop Node CPU and disk SQLite; not iPhone rendering or Expo SQLite bridge',
    cases: [await run(180, false), await run(730, true)],
  };
  console.log(JSON.stringify(results, null, 2));
  if (process.argv[2])
    writeFileSync(process.argv[2], JSON.stringify(results, null, 2));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
