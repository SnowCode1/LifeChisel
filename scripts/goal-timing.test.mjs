import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  ordinal,
  timingDate,
  scheduledOn,
  scheduledCount,
  validCycle,
  validPeriod,
  periodWindow,
  nextPeriodStart,
  weekAnchor,
} from '../packages/core/src/goalTiming.ts';
import {
  evaluateGoal,
  validGoalTimeline,
  allWeekdays,
} from '../packages/core/src/habitGoals.ts';
import { completionStatistics } from '../packages/core/src/completionStatistics.ts';
import { periodStatistics } from '../packages/core/src/periodStatistics.ts';
import { completionMask } from '../packages/core/src/habitCompletion.ts';
import { ChangeStore } from '../packages/core/src/storage/store.ts';
import { sqliteRepository } from '../packages/core/src/storage/repository.ts';
import {
  replayEvents,
  validateChange,
} from '../packages/core/src/storage/model.ts';
import {
  encodeArchive,
  decodeArchive,
} from '../packages/core/src/storage/archive.ts';
const base = {
  id: 'walk',
  name: 'Walk',
  color: '#AABBCC',
  type: 'checkbox',
  startDate: '2026-01-05',
};
const period = {
  unit: 'week',
  days: 7,
  anchor: '2026-01-05',
  operator: 'atLeast',
  target: 3,
};
const goal = {
  id: 'first',
  from: '2026-01-05',
  rule: { kind: 'checked' },
  weekdays: allWeekdays,
  period,
};
const habit = { ...base, goals: [goal] };
const values = (...dates) =>
  Object.fromEntries(dates.map((date) => [`walk:${date}`, 1]));
const digest = async (text) => createHash('sha256').update(text).digest('hex');

test('on/off cycles anchor to dates, span weeks and leave off-day values intact', () => {
  const cycle = { unit: 'days', on: 5, off: 2, anchor: '2026-01-05' };
  const h = { ...base, goals: [{ ...goal, period: undefined, cycle }] };
  delete h.goals[0].period;
  assert.equal(evaluateGoal(h, 1, '2026-01-09').scheduled, true);
  assert.equal(evaluateGoal(h, 1, '2026-01-10').scheduled, false);
  assert.equal(evaluateGoal(h, 1, '2026-01-10').met, true);
  assert.equal(evaluateGoal(h, 1, '2026-01-12').scheduled, true);
  assert.equal(completionMask([h], values('2026-01-10'), '2026-01-10'), '1');
  for (const [on, off] of [
    [3, 1],
    [1, 1],
  ]) {
    const c = { ...cycle, unit: 'weeks', on, off };
    for (let day = 0; day < 70; day++)
      assert.equal(
        scheduledOn(
          { weekdays: allWeekdays, cycle: c },
          ordinal(c.anchor) + day,
        ),
        day % ((on + off) * 7) < on * 7,
      );
  }
  const v = values('2026-01-09', '2026-01-10', '2026-01-12');
  const stats = completionStatistics(
    h,
    v,
    base.startDate,
    '2026-01-12',
    base.startDate,
  );
  assert.equal(stats.eligible, 6);
  assert.equal(stats.successes, 2);
  assert.equal(stats.streak, 2);
});

test('bounded schedule arithmetic matches day-by-day counting before/after anchors, with weekday filters', () => {
  for (const unit of ['days', 'weeks'])
    for (const on of [1, 3, 5, 13])
      for (const off of [1, 2, 7]) {
        const timing = {
          weekdays: [1, 3, 5],
          cycle: { unit, on, off, anchor: '2026-03-29' },
        };
        const start = ordinal(timing.cycle.anchor) - 157,
          end = start + 720;
        for (const only of [undefined, 0, 1, 5]) {
          let expected = 0;
          for (let day = start; day <= end; day++)
            if (
              scheduledOn(timing, day) &&
              (only === undefined ||
                new Date(day * 86400000).getUTCDay() === only)
            )
              expected++;
          assert.equal(scheduledCount(timing, start, end, only), expected);
        }
      }
  const t = {
    weekdays: allWeekdays,
    cycle: { unit: 'days', on: 5, off: 2, anchor: '2026-01-05' },
  };
  assert.equal(
    scheduledCount(
      t,
      ordinal('2026-01-05'),
      ordinal('2026-01-05') + 700000 - 1,
    ),
    500000,
  );
});

test('periods remain open through their last day; counts include distinct scheduled successful dates only', () => {
  const records = values(
    '2026-01-05',
    '2026-01-07',
    '2026-01-09',
    '2026-01-20',
  );
  const open = periodStatistics(
    habit,
    records,
    base.startDate,
    '2026-01-11',
    base.startDate,
  );
  assert.equal(open.eligible, 0);
  assert.equal(open.current.count, 3);
  assert.equal(open.current.status, 'progress');
  const done = periodStatistics(
    habit,
    records,
    base.startDate,
    '2026-01-12',
    base.startDate,
  );
  assert.equal(done.eligible, 1);
  assert.equal(done.met, 1);
  assert.equal(done.streak, 1);
  assert.equal(done.current.count, 0);
  const missed = periodStatistics(
    habit,
    records,
    base.startDate,
    '2026-01-19',
    base.startDate,
  );
  assert.equal(missed.eligible, 2);
  assert.equal(missed.met, 1);
  assert.equal(missed.streak, 0);
  assert.equal(weekAnchor('2026-01-07', 'sunday'), '2026-01-04');
  assert.equal(nextPeriodStart(period, '2026-01-07'), '2026-01-12');
  assert.equal(nextPeriodStart(period, '2026-01-12'), '2026-01-12');
  assert.equal(
    periodWindow({ ...period, unit: 'days', days: 10 }, '2026-01-16').start,
    ordinal('2026-01-15'),
  );
});

test('at-most and inclusive range periods score zero deliberately; current ranges remain provisional', () => {
  const make = (p) => ({
    ...habit,
    goals: [{ ...goal, period: { ...period, ...p } }],
  });
  for (const p of [
    { operator: 'atMost', target: 0 },
    { operator: 'between', target: 0, upper: 2 },
  ]) {
    const stats = periodStatistics(
      make(p),
      {},
      base.startDate,
      '2026-01-19',
      base.startDate,
    );
    assert.equal(stats.eligible, 2);
    assert.equal(stats.met, 2);
    assert.equal(stats.streak, 2);
    assert.equal(stats.current.status, 'progress');
  }
  const h = make({ operator: 'between', target: 1, upper: 2 });
  const r = values('2026-01-05', '2026-01-06', '2026-01-07', '2026-01-12');
  const s = periodStatistics(
    h,
    r,
    base.startDate,
    '2026-01-19',
    base.startDate,
  );
  assert.equal(s.met, 1);
  assert.equal(s.streak, 1);
  assert.equal(s.bestStreak, 1);
});

test('rest weeks are neutral, partial starts and policy changes do not prorate, future entries/goals do not score', () => {
  const alternating = {
    ...habit,
    goals: [
      { ...goal, cycle: { unit: 'weeks', on: 1, off: 1, anchor: goal.from } },
    ],
  };
  const r = values(
    '2026-01-05',
    '2026-01-06',
    '2026-01-07',
    '2026-01-12',
    '2026-01-19',
    '2026-01-20',
    '2026-01-21',
  );
  let s = periodStatistics(
    alternating,
    r,
    base.startDate,
    '2026-01-26',
    base.startDate,
  );
  assert.equal(s.eligible, 2);
  assert.equal(s.met, 2);
  assert.equal(s.streak, 2);
  assert.equal(s.current.status, 'rest');
  const changed = {
    ...habit,
    goals: [
      goal,
      {
        ...goal,
        id: 'second',
        from: '2026-01-08',
        period: { ...period, target: 4 },
      },
      { ...goal, id: 'future', from: '2026-02-01' },
    ],
  };
  s = periodStatistics(
    changed,
    r,
    base.startDate,
    '2026-01-19',
    base.startDate,
  );
  assert.equal(s.eligible, 1);
  assert.equal(s.met, 0);
  assert.ok(s.recent.some((row) => row.status === 'partial'));
  s = periodStatistics(habit, r, '2026-01-07', '2026-01-12', base.startDate);
  assert.equal(s.eligible, 0);
});

test('period totals and streaks match a simple bounded reference across periods, cycles and ranges', () => {
  for (const days of [1, 3, 7, 10, 31])
    for (const operator of ['atLeast', 'atMost', 'between'])
      for (const cycle of [
        undefined,
        { unit: 'days', on: 5, off: 2, anchor: '2026-01-06' },
        { unit: 'weeks', on: 3, off: 1, anchor: '2026-01-05' },
      ]) {
        const p = {
          ...period,
          unit: 'days',
          days,
          operator,
          target: Math.min(2, days),
          ...(operator === 'between' ? { upper: Math.min(4, days) } : {}),
        };
        const h = {
          ...habit,
          goals: [{ ...goal, period: p, ...(cycle ? { cycle } : {}) }],
        };
        const r = {};
        const first = ordinal(base.startDate),
          now = first + 180,
          range = first + 15;
        for (let i = 0; i <= 200; i++)
          if ((i * 17 + 3) % 11 < 5) r[`walk:${timingDate(first + i)}`] = 1;
        let eligible = 0,
          met = 0,
          streak = 0,
          best = 0;
        for (let start = first; start + days - 1 < now; start += days) {
          let active = 0,
            count = 0;
          for (let day = start; day < start + days; day++)
            if (scheduledOn(h.goals[0], day)) {
              active++;
              if (r[`walk:${timingDate(day)}`]) count++;
            }
          if (!active) continue;
          const success =
            operator === 'atLeast'
              ? count >= p.target
              : operator === 'atMost'
                ? count <= p.target
                : count >= p.target && count <= p.upper;
          streak = success ? streak + 1 : 0;
          best = Math.max(best, streak);
          if (start >= range) {
            eligible++;
            met += Number(success);
          }
        }
        const s = periodStatistics(
          h,
          r,
          base.startDate,
          timingDate(now),
          timingDate(range),
        );
        assert.deepEqual(
          [s.eligible, s.met, s.streak, s.bestStreak],
          [eligible, met, streak, best],
          JSON.stringify({ days, operator, cycle }),
        );
      }
});

test('timing bounds/unknown fields/legacy versions reject malformed schedules', () => {
  assert.equal(validGoalTimeline(habit.goals, habit), true);
  assert.equal(validGoalTimeline(habit.goals, habit, false), false);
  for (const p of [
    { ...period, days: 8 },
    { ...period, target: 8 },
    { ...period, operator: 'between', upper: 2 },
    { ...period, anchor: '2026-02-30' },
    { ...period, extra: true },
  ])
    assert.equal(validPeriod(p), false);
  for (const c of [
    { unit: 'days', on: 0, off: 2, anchor: goal.from },
    { unit: 'weeks', on: 53, off: 1, anchor: goal.from },
    { unit: 'days', on: 3, off: 1, anchor: 'no' },
  ])
    assert.equal(validCycle(c), false);
  assert.throws(() =>
    validateChange(
      { kind: 'habit', habitId: base.id, index: 0, before: base, after: habit },
      12,
    ),
  );
  assert.doesNotThrow(() =>
    validateChange(
      { kind: 'habit', habitId: base.id, index: 0, before: base, after: habit },
      13,
    ),
  );
});

let sequenceId = 0;
const meta = (sequence) => ({
  version: 13,
  id: `timing_${++sequenceId}`,
  sequence,
  recordedAt: '2026-10-06T12:00:00.000Z',
  timeZone: 'UTC',
  utcOffsetMinutes: 0,
});
function port(raw) {
  const db = {
    execAsync: async (sql) => raw.exec(sql),
    runAsync: async (sql, ...args) => raw.prepare(sql).run(...args),
    getFirstAsync: async (sql, ...args) =>
      raw.prepare(sql).get(...args) ?? null,
    getAllAsync: async (sql, ...args) => raw.prepare(sql).all(...args),
    withExclusiveTransactionAsync: async (task) => {
      raw.exec('BEGIN IMMEDIATE');
      try {
        const result = await task(db);
        raw.exec('COMMIT');
        return result;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return db;
}
test('v13 period/cycle edits survive SQLite reopen, undo/redo and atomic backup recovery with old data intact', async (t) => {
  const raw = new DatabaseSync(':memory:');
  t.after(() => raw.close());
  const repository = sqliteRepository(port(raw), () => ({
    ...meta(1),
    version: 12,
    type: 'initialize',
    habits: [base],
  }));
  let store = new ChangeStore(repository, meta);
  await store.load();
  store.change({
    kind: 'entry',
    habitId: base.id,
    date: '2026-01-06',
    before: null,
    after: 1,
  });
  const after = {
    ...habit,
    goals: [
      { ...goal, cycle: { unit: 'weeks', on: 3, off: 1, anchor: goal.from } },
    ],
  };
  assert.equal(
    store.change({
      kind: 'habit',
      habitId: base.id,
      index: 0,
      before: base,
      after,
    }),
    true,
  );
  await store.flush();
  store = new ChangeStore(repository, meta);
  await store.load();
  assert.deepEqual(store.getSnapshot().replay.state.habits[0], after);
  store.undo();
  assert.deepEqual(store.getSnapshot().replay.state.habits[0], base);
  store.redo();
  await store.flush();
  const archive = await encodeArchive(
    store.getSnapshot().events,
    '2026-10-06T12:00:00.000Z',
    digest,
  );
  assert.equal(JSON.parse(archive).version, 25);
  const decoded = await decodeArchive(archive, digest);
  await store.exclusive(() => store.replace(decoded.events));
  assert.deepEqual(store.getSnapshot().replay.state.habits[0], after);
  assert.equal(store.getSnapshot().replay.state.values['walk:2026-01-06'], 1);
  assert.equal(
    raw.prepare('SELECT COUNT(*) AS count FROM recovery_archives').get().count,
    1,
  );
  assert.throws(
    () =>
      replayEvents([
        ...decoded.events,
        {
          ...meta(decoded.events.length + 1),
          version: 12,
          type: 'preference',
          change: { kind: 'haptics', before: true, after: false },
        },
      ]),
    /version-25/,
  );
});
test('version-13 fixture extends the unchanged version-12 log and restores goals with Undo/Redo', async () => {
  const old = JSON.parse(
    readFileSync(
      new URL('../docs/examples/storage-v12.json', import.meta.url),
      'utf8',
    ),
  );
  const next = JSON.parse(
    readFileSync(
      new URL('../docs/examples/storage-v13.json', import.meta.url),
      'utf8',
    ),
  );
  assert.deepEqual(next.events.slice(0, old.events.length), old.events);
  const decoded = await decodeArchive(JSON.stringify(next), digest);
  assert.equal(decoded.replay.hasV13, true);
  assert.ok(
    decoded.replay.state.habits.some((h) =>
      h.goals?.some((g) => g.period && g.cycle),
    ),
  );
});

test('millennia of blank periods use bounded arithmetic and materialize only recent results', () => {
  const h = {
    ...base,
    startDate: '0001-01-01',
    goals: [
      {
        ...goal,
        from: '0001-01-01',
        period: {
          unit: 'days',
          days: 1,
          anchor: '0001-01-01',
          operator: 'atMost',
          target: 0,
        },
        cycle: { unit: 'days', on: 5, off: 2, anchor: '0001-01-01' },
      },
    ],
  };
  const s = periodStatistics(h, {}, h.startDate, '9999-12-31', h.startDate);
  const expected = scheduledCount(
    h.goals[0],
    ordinal(h.startDate),
    ordinal('9999-12-30'),
  );
  assert.equal(s.eligible, expected);
  assert.equal(s.met, expected);
  assert.equal(s.bestStreak, expected);
  assert.equal(s.recent.length, 8);
});
test('split periods retain distinct identities and show only their effective fragments', () => {
  const h = {
    ...habit,
    goals: [
      goal,
      {
        ...goal,
        id: 'changed',
        from: '2026-01-08',
        period: { ...period, target: 4 },
      },
    ],
  };
  const s = periodStatistics(
    h,
    {},
    base.startDate,
    '2026-01-12',
    base.startDate,
  );
  const pieces = s.recent.filter((row) => row.status === 'partial');
  assert.equal(new Set(pieces.map((row) => row.id)).size, 2);
  assert.deepEqual(
    pieces.map((row) => [row.start, row.end]),
    [
      ['2026-01-08', '2026-01-11'],
      ['2026-01-05', '2026-01-07'],
    ],
  );
});
