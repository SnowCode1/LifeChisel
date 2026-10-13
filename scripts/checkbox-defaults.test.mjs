import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  checkboxChecked,
  toggleCheckboxValue,
  withCheckboxDefault,
  evaluateGoal,
  allWeekdays,
  validGoalTimeline,
} from '../packages/core/src/habitGoals.ts';
import {
  completionStatistics,
  summarizeCompletion,
} from '../packages/core/src/completionStatistics.ts';
import { periodStatistics } from '../packages/core/src/periodStatistics.ts';
import {
  ordinal,
  timingDate,
  periodMet,
} from '../packages/core/src/goalTiming.ts';
import {
  replayEvents,
  validateChange,
} from '../packages/core/src/storage/model.ts';
import { ChangeStore } from '../packages/core/src/storage/store.ts';
import { sqliteRepository } from '../packages/core/src/storage/repository.ts';
import {
  encodeArchive,
  decodeArchive,
} from '../packages/core/src/storage/archive.ts';
const base = {
  id: 'walk',
  name: 'Walk',
  color: '#AABBCC',
  type: 'checkbox',
  startDate: '2026-01-01',
};
const goal = {
  id: 'first',
  from: base.startDate,
  rule: { kind: 'checked' },
  weekdays: allWeekdays,
};
const make = (checked, kind = 'checked') => ({
  ...base,
  goals: [{ ...goal, defaultChecked: checked, rule: { kind } }],
});
test('checkbox state, success and sparse toggle overrides are independent', () => {
  for (const checked of [false, true])
    for (const kind of ['checked', 'unchecked']) {
      const h = make(checked, kind),
        date = base.startDate;
      assert.equal(checkboxChecked(h, undefined, date), checked);
      assert.equal(
        evaluateGoal(h, undefined, date).met,
        checked === (kind === 'checked'),
      );
      assert.equal(evaluateGoal(h, 0, date).met, kind === 'unchecked');
      assert.equal(evaluateGoal(h, 1, date).met, kind === 'checked');
      const after = toggleCheckboxValue(h, undefined, date);
      assert.equal(after, checked ? 0 : 1);
      assert.equal(toggleCheckboxValue(h, after, date), null);
      assert.equal(evaluateGoal(h, undefined, '2025-12-31').met, false);
    }
  assert.equal(evaluateGoal(base, undefined, base.startDate).met, false);
});
test('dated defaults preserve earlier days, explicit values and future versions', () => {
  const h = make(false);
  h.goals.push({
    ...goal,
    id: 'future',
    from: '2026-03-01',
    defaultChecked: false,
  });
  h.goals = withCheckboxDefault(h, '2026-02-01', true, 'change');
  assert.equal(checkboxChecked(h, undefined, '2026-01-31'), false);
  assert.equal(checkboxChecked(h, undefined, '2026-02-01'), true);
  assert.equal(checkboxChecked(h, 0, '2026-02-01'), false);
  assert.equal(checkboxChecked(h, undefined, '2026-03-01'), false);
  assert.equal(
    withCheckboxDefault(h, '2026-02-01', false, 'other')[1].id,
    'change',
  );
});
test('new definitions and unchecked overrides require v14; malformed defaults fail', () => {
  const h = make(true, 'unchecked'),
    change = {
      kind: 'habit',
      habitId: 'walk',
      index: 0,
      before: base,
      after: h,
    };
  assert.doesNotThrow(() => validateChange(change, 14));
  assert.throws(() => validateChange(change, 13));
  for (const v of [null, 1, 'true'])
    assert.equal(
      validGoalTimeline([{ ...goal, defaultChecked: v }], base),
      false,
    );
  assert.equal(
    validGoalTimeline(
      [{ ...goal, rule: { kind: 'none' }, defaultChecked: false }],
      { ...base, type: 'number' },
    ),
    false,
  );
  const initialize = {
    ...meta(1),
    version: 13,
    type: 'initialize',
    habits: [base],
  };
  const entry = {
    ...meta(2),
    version: 13,
    type: 'change',
    groupId: 'group',
    change: {
      kind: 'entry',
      habitId: 'walk',
      date: base.startDate,
      before: null,
      after: 0,
    },
  };
  entry.groupId = entry.id;
  assert.throws(() => replayEvents([initialize, entry]));
  assert.equal(
    replayEvents([initialize, { ...entry, version: 14 }]).replay.state.values[
      'walk:2026-01-01'
    ],
    0,
  );
});
test('implicit success statistics match daily enumeration through cycles, edits and exceptions', () => {
  for (const checked of [false, true])
    for (const kind of ['checked', 'unchecked']) {
      const h = make(checked, kind);
      h.goals[0].cycle = {
        unit: 'days',
        on: 5,
        off: 2,
        anchor: base.startDate,
      };
      h.goals[0].weekdays = [1, 2, 3, 4, 5];
      h.goals.push({
        ...goal,
        id: 'second',
        from: '2026-02-03',
        defaultChecked: !checked,
        rule: { kind },
      });
      const values = {};
      for (let n = 0; n < 80; n += 4)
        values[`walk:${timingDate(ordinal(base.startDate) + n)}`] =
          n % 8 ? 1 : 0;
      const today = '2026-03-10',
        stats = completionStatistics(
          h,
          values,
          base.startDate,
          today,
          base.startDate,
        );
      let count = 0,
        eligible = 0,
        run = 0,
        best = 0;
      for (let n = ordinal(base.startDate); n <= ordinal(today); n++) {
        const date = timingDate(n),
          r = evaluateGoal(h, values[`walk:${date}`], date);
        if (!r.scheduled) continue;
        eligible++;
        if (r.met) {
          count++;
          run++;
          best = Math.max(best, run);
        } else if (date !== today) run = 0;
      }
      assert.equal(stats.successes, count);
      assert.equal(stats.eligible, eligible);
      assert.equal(stats.streak, run);
      assert.equal(stats.bestStreak, best);
      const mon = summarizeCompletion(stats, base.startDate, today, 1);
      assert.ok(mon.successes <= mon.eligible);
    }
});
test('period defaults match enumerated weekly results for all operators and cycles', () => {
  for (const checked of [false, true])
    for (const kind of ['checked', 'unchecked'])
      for (const operator of ['atLeast', 'atMost', 'between']) {
        const h = make(checked, kind),
          period = {
            unit: 'days',
            days: 7,
            anchor: base.startDate,
            operator,
            target: 2,
            ...(operator === 'between' ? { upper: 4 } : {}),
          };
        h.goals[0].period = period;
        h.goals[0].cycle = {
          unit: 'days',
          on: 9,
          off: 12,
          anchor: base.startDate,
        };
        const values = {};
        for (let n = 0; n < 150; n += 3)
          values[`walk:${timingDate(ordinal(base.startDate) + n)}`] = n % 2;
        const today = timingDate(ordinal(base.startDate) + 140),
          result = periodStatistics(
            h,
            values,
            base.startDate,
            today,
            base.startDate,
          );
        let eligible = 0,
          met = 0,
          run = 0,
          best = 0;
        for (let i = 0; i < 20; i++) {
          let count = 0,
            active = 0;
          for (let j = 0; j < 7; j++) {
            const d = timingDate(ordinal(base.startDate) + i * 7 + j),
              r = evaluateGoal(h, values[`walk:${d}`], d);
            if (r.scheduled) {
              active++;
              count += Number(r.met);
            }
          }
          if (!active) continue;
          eligible++;
          const success = periodMet(period, count);
          met += Number(success);
          run = success ? run + 1 : 0;
          best = Math.max(best, run);
        }
        assert.equal(result.eligible, eligible);
        assert.equal(result.met, met);
        assert.equal(result.streak, run);
        assert.equal(result.bestStreak, best);
      }
  const h = make(true);
  h.startDate = '0001-01-01';
  h.goals[0].from = h.startDate;
  h.goals[0].period = {
    unit: 'days',
    days: 1,
    anchor: h.startDate,
    operator: 'atLeast',
    target: 1,
  };
  const large = periodStatistics(h, {}, h.startDate, '9999-12-31', h.startDate);
  assert.ok(large.met > 3_000_000);
  assert.equal(large.met, large.streak);
});
let id = 0;
const meta = (sequence) => ({
  version: 14,
  id: `defaults_${++id}`,
  sequence,
  recordedAt: '2026-10-06T12:00:00.000Z',
  timeZone: 'UTC',
  utcOffsetMinutes: 0,
});
const digest = async (text) => createHash('sha256').update(text).digest('hex');
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
        const r = await task(db);
        raw.exec('COMMIT');
        return r;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return db;
}
test('defaults and explicit off survive SQLite reload, Undo/Redo, net-zero grouping and restore', async (t) => {
  const raw = new DatabaseSync(':memory:');
  t.after(() => raw.close());
  const repo = sqliteRepository(port(raw), () => ({
    ...meta(1),
    version: 13,
    type: 'initialize',
    habits: [base],
  }));
  let store = new ChangeStore(repo, meta);
  await store.load();
  assert.equal(
    store.change({
      kind: 'habit',
      habitId: 'walk',
      index: 0,
      before: base,
      after: make(true),
    }),
    true,
  );
  const edit = (before, after) =>
    store.change({
      kind: 'entry',
      habitId: 'walk',
      date: base.startDate,
      before,
      after,
    });
  assert.equal(edit(null, 0), true);
  assert.equal(edit(0, null), true);
  assert.equal(store.getSnapshot().replay.undo.length, 1);
  edit(null, 0);
  await store.flush();
  store = new ChangeStore(repo, meta);
  await store.load();
  assert.equal(store.getSnapshot().replay.state.values['walk:2026-01-01'], 0);
  store.undo();
  assert.equal(
    checkboxChecked(
      store.getSnapshot().replay.state.habits[0],
      store.getSnapshot().replay.state.values['walk:2026-01-01'],
      base.startDate,
    ),
    true,
  );
  store.redo();
  await store.flush();
  const text = await encodeArchive(
      store.getSnapshot().events,
      '2026-10-06T12:00:00.000Z',
      digest,
    ),
    decoded = await decodeArchive(text, digest);
  await store.exclusive(() => store.replace(decoded.events));
  assert.equal(store.getSnapshot().replay.state.values['walk:2026-01-01'], 0);
  assert.throws(
    () =>
      replayEvents([
        ...decoded.events,
        {
          ...meta(decoded.events.length + 1),
          version: 13,
          type: 'preference',
          change: { kind: 'haptics', before: true, after: false },
        },
      ]),
    /version-20/,
  );
});
test('v14 example retains the exact v13 prefix', async () => {
  const old = JSON.parse(
    readFileSync(new URL('../docs/examples/storage-v13.json', import.meta.url)),
  );
  const current = await decodeArchive(
    readFileSync(
      new URL('../docs/examples/storage-v14.json', import.meta.url),
      'utf8',
    ),
    digest,
  );
  assert.deepEqual(current.events.slice(0, old.events.length), old.events);
  assert.equal(current.replay.hasV14, true);
});

test('default-on progress counts only elapsed days and keeps split periods unscored', () => {
  const h = make(true);
  h.goals[0].period = {
    unit: 'days',
    days: 7,
    anchor: base.startDate,
    operator: 'atLeast',
    target: 4,
  };
  const values = { 'walk:2026-01-02': 0, 'walk:2026-01-07': 0 };
  let stats = periodStatistics(
    h,
    values,
    base.startDate,
    '2026-01-03',
    base.startDate,
  );
  assert.equal(stats.current.count, 2);
  assert.equal(stats.current.status, 'progress');
  assert.equal(stats.eligible, 0);
  h.goals.push({
    ...h.goals[0],
    id: 'later',
    from: '2026-01-04',
    defaultChecked: false,
  });
  stats = periodStatistics(
    h,
    values,
    base.startDate,
    '2026-01-10',
    base.startDate,
  );
  assert.equal(stats.eligible, 0);
  assert.ok(
    stats.recent
      .filter((row) => row.end < '2026-01-10')
      .every((row) => row.status === 'partial'),
  );
  const daily = completionStatistics(
    h,
    values,
    base.startDate,
    '2026-01-10',
    base.startDate,
  );
  assert.equal(daily.successes, 2);
});
