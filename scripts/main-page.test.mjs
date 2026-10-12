import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { recentNumericTotals } from '../src/numericSuggestions.ts';
import { gridLayout } from '../src/gridLayout.ts';
import { gridSizing } from '../src/gridSizing.ts';
import {
  effectiveColumnSpacing,
  displayDefaults,
} from '../src/displayPreferences.ts';
import { createGridDayCache } from '../src/calendar.ts';
import {
  evaluateGoal,
  goalAt,
  defaultSuccessRule,
  ruleIsMet,
  allWeekdays,
  checkboxChecked,
} from '../src/habitGoals.ts';
import { ordinal, timingDate, scheduledOn } from '../src/goalTiming.ts';
import { entryCorrection, receiptIsCurrent } from '../src/quickEntryUndo.ts';
import {
  useDelayedCompletionMask,
  COMPLETION_PAUSE_MS,
} from '../src/useDelayedCompletionMask.ts';
import { ChangeStore } from '../src/storage/store.ts';
import { sqliteRepository } from '../src/storage/repository.ts';
import { encodeArchive, decodeArchive } from '../src/storage/archive.ts';
import {
  validateChange,
  replayEvents,
  applyEvent,
} from '../src/storage/model.ts';
const digest = async (text) => createHash('sha256').update(text).digest('hex');
const habit = { id: 'read', name: 'Read', color: '#BDA5FF', type: 'number' };
test('recent totals are distinct, bounded, ranked by frequency then recency, and preserve zero', () => {
  const values = {
    'read:2026-03-09': 0,
    'read:2026-03-08': 30,
    'read:2026-03-07': 0,
    'read:2026-03-06': 20,
    'read:2026-03-05': 20,
    'read:2026-03-04': 40,
    'read:2026-03-11': 99,
    'read:2026-03-10': 80,
    'read:2020-01-01': 99,
    'other:2026-03-09': 999,
  };
  assert.deepEqual(
    recentNumericTotals(values, 'read', '2026-03-10'),
    [0, 20, 30],
  );
  assert.deepEqual(recentNumericTotals({}, 'read', '2026-03-10'), []);
  assert.deepEqual(recentNumericTotals(values, 'read', '2020-01-02'), [99]);
});
test('name widths preserve whole columns, readable target sizes, and the old Compact geometry as Standard', () => {
  assert.equal(displayDefaults.columnSpacing, 'standard');
  assert.equal(effectiveColumnSpacing({}), 'standard');
  assert.equal(
    effectiveColumnSpacing({ columnSpacing: 'compact' }),
    'standard',
  );
  assert.equal(effectiveColumnSpacing({ columnSpacing: 'standard' }), 'roomy');
  assert.equal(
    effectiveColumnSpacing({
      columnSpacing: 'compact',
      columnDensity: 'compact',
    }),
    'compact',
  );
  const layoutFor = (width, scale, spacing, names) =>
    gridLayout(width, scale, gridSizing({ nameColumnWidth: names }, spacing));
  for (const width of [324, 366, 680, 812])
    for (const scale of [1, 1.5, 2]) {
      const layouts = ['narrow', 'standard', 'wide'].map((names) =>
        layoutFor(width, scale, 'standard', names),
      );
      assert.ok(
        layouts[0].nameWidth <= layouts[1].nameWidth &&
          layouts[1].nameWidth <= layouts[2].nameWidth,
      );
      for (const names of ['narrow', 'standard', 'wide'])
        for (const spacing of ['compact', 'standard', 'roomy']) {
          const layout = layoutFor(width, scale, spacing, names);
          assert.ok(layout.columnWidth >= Math.min(layout.dateWidth, 44));
          assert.ok(
            Math.abs(
              layout.nameWidth +
                layout.columnWidth * layout.visibleDays -
                width,
            ) < 0.001,
          );
        }
    }
  assert.equal(layoutFor(366, 1, 'standard').visibleDays, 4);
  assert.equal(layoutFor(366, 1, 'compact').visibleDays, 5);
  assert.equal(layoutFor(366, 1, 'roomy').visibleDays, 3);
});
test('arbitrary history/future windows retain overlapping dates without filling intervening years', () => {
  const cache = createGridDayCache('2026-03-10');
  const initial = cache(120);
  const old = cache(120, 0, 5000);
  assert.equal(old.length, 120);
  assert.equal(old[0].key, timingDate(ordinal('2026-03-10') - 5000));
  const expanded = cache(210, 0, 4910);
  assert.equal(expanded[90], old[0]);
  const future = cache(120, 0, -5000);
  assert.equal(future[0].daysAgo, -5000);
  assert.equal(future[0].key, timingDate(ordinal('2026-03-10') + 5000));
  assert.equal(cache(120)[0].key, initial[0].key);
});
test('cached date policies keep live values, dated defaults, cycles and start boundaries equivalent', () => {
  const habits = [
    {
      id: 'check',
      name: 'Check',
      color: '#FFFFFF',
      startDate: '2026-01-03',
      goals: [
        {
          id: 'a',
          from: '2026-01-01',
          rule: { kind: 'unchecked' },
          defaultChecked: true,
          weekdays: [1, 3, 5],
          cycle: { unit: 'days', on: 5, off: 2, anchor: '2026-01-01' },
        },
        {
          id: 'b',
          from: '2026-03-01',
          rule: { kind: 'checked' },
          defaultChecked: false,
          weekdays: allWeekdays,
        },
      ],
    },
    {
      ...habit,
      goals: [
        {
          id: 'a',
          from: '2026-01-01',
          rule: { kind: 'number', operator: 'between', target: 10, upper: 30 },
          weekdays: [1, 2, 3],
        },
      ],
    },
    {
      ...habit,
      type: 'text',
      goals: [
        {
          id: 'a',
          from: '2026-01-01',
          rule: { kind: 'text', match: 'all', terms: ['A walk', 'river'] },
          weekdays: allWeekdays,
        },
      ],
    },
    {
      ...habit,
      type: 'categorical',
      goals: [
        {
          id: 'a',
          from: '2026-01-01',
          rule: {
            kind: 'categories',
            match: 'all',
            ids: ['a'],
            exclude: ['b'],
          },
          weekdays: allWeekdays,
        },
      ],
    },
  ];
  for (const h of habits)
    for (let ago = -20; ago < 400; ago++) {
      const date = timingDate(ordinal('2026-04-01') - ago);
      const goal = goalAt(h, date),
        rule = goal?.rule ?? defaultSuccessRule(h);
      const withinStart = !h.startDate || date >= h.startDate;
      for (const value of [
        undefined,
        0,
        1,
        10,
        40,
        'A walk by the river',
        ['a'],
        ['a', 'b'],
      ]) {
        const effective = h.type
          ? value
          : Number(
              value === 1 || value === 0
                ? value === 1
                : withinStart && (goal?.defaultChecked ?? false),
            );
        const expected = {
          goal,
          rule,
          active: rule.kind !== 'none',
          scheduled:
            withinStart &&
            rule.kind !== 'none' &&
            scheduledOn(goal ?? { weekdays: allWeekdays }, ordinal(date)),
          met: withinStart && ruleIsMet(rule, effective),
          recorded: value !== undefined,
        };
        assert.deepEqual(evaluateGoal(h, value, date), expected);
        if (!h.type)
          assert.equal(checkboxChecked(h, value, date), effective === 1);
      }
      const edited = { ...h, startDate: '2027-01-01' };
      assert.equal(evaluateGoal(edited, 1, date).met, false);
    }
});
test('date-policy cache removes repeated timeline work and remains bounded for long browsing', () => {
  let lookups = 0;
  const h = {
    ...habit,
    goals: [
      {
        id: 'a',
        get from() {
          lookups++;
          return '2026-01-01';
        },
        rule: { kind: 'number', operator: 'atLeast', target: 20 },
        weekdays: allWeekdays,
      },
    ],
  };
  evaluateGoal(h, 10, '2026-01-01');
  const cold = lookups;
  for (let i = 0; i < 100; i++)
    assert.equal(evaluateGoal(h, i, '2026-01-01').met, i >= 20);
  assert.equal(lookups, cold);
  for (let i = 1; i < 600; i++)
    evaluateGoal(h, 30, timingDate(ordinal('2026-01-01') + i));
  const before = lookups;
  assert.equal(evaluateGoal(h, 0, '2026-01-01').met, false);
  assert.ok(lookups > before);
});
test('completion filtering keeps a tap burst in place and reveals undone rows immediately', (t) => {
  const browser = new JSDOM('<div id="root"></div>');
  const prior = {
    window: globalThis.window,
    document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  globalThis.window = browser.window;
  globalThis.document = browser.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const root = createRoot(document.getElementById('root'));
  const habits = [{ id: 'a' }, { id: 'b' }];
  let displayed;
  function Filtering({ mask, enabled = true, today = '2026-10-07' }) {
    displayed = useDelayedCompletionMask(mask, habits, today, enabled);
    return React.createElement('div', null, displayed);
  }
  const render = (mask, rest = {}) =>
    act(() => root.render(React.createElement(Filtering, { mask, ...rest })));
  try {
    render('00');
    render('10');
    assert.equal(displayed, '00');
    act(() => t.mock.timers.tick(400));
    render('11');
    act(() => t.mock.timers.tick(400));
    assert.equal(displayed, '00');
    act(() => t.mock.timers.tick(COMPLETION_PAUSE_MS - 400));
    assert.equal(displayed, '11');
    render('01');
    assert.equal(displayed, '01');
    render('11');
    assert.equal(displayed, '01');
    render('00', { today: '2026-10-08' });
    assert.equal(displayed, '00');
    act(() => t.mock.timers.tick(2000));
    assert.equal(displayed, '00');
    render('', { enabled: false });
    assert.equal(displayed, '');
  } finally {
    act(() => root.unmount());
    browser.window.close();
    globalThis.window = prior.window;
    globalThis.document = prior.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = prior.act;
  }
});
function sqlPort(raw) {
  const db = {
    execAsync: async (sql) => raw.exec(sql),
    runAsync: async (sql, ...args) => raw.prepare(sql).run(...args),
    getFirstAsync: async (sql, ...args) =>
      raw.prepare(sql).get(...args) ?? null,
    getAllAsync: async (sql, ...args) => raw.prepare(sql).all(...args),
    withExclusiveTransactionAsync: async (task) => {
      raw.exec('BEGIN IMMEDIATE');
      try {
        const value = await task(db);
        raw.exec('COMMIT');
        return value;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return db;
}
test('v17 width/density preferences persist in SQLite/backup without changing legacy logs, history or Redo', async (t) => {
  const raw = new DatabaseSync(':memory:');
  t.after(() => raw.close());
  let id = 0;
  const meta = (sequence) => ({
    version: 17,
    id: `main_${++id}`,
    sequence,
    recordedAt: '2026-10-07T04:00:00.000Z',
    timeZone: 'UTC',
    utcOffsetMinutes: 0,
  });
  const repo = sqliteRepository(sqlPort(raw), () => ({
    ...meta(1),
    version: 16,
    type: 'initialize',
    habits: [habit],
  }));
  let store = new ChangeStore(repo, meta);
  await store.load();
  store.change({
    kind: 'entry',
    habitId: habit.id,
    date: '2026-10-07',
    before: null,
    after: 30,
  });
  store.undo();
  const redo = store.getSnapshot().replay.redo.map((item) => item.undoId);
  for (const change of [
    { kind: 'nameColumnWidth', before: 'standard', after: 'narrow' },
    { kind: 'columnDensity', before: 'standard', after: 'compact' },
  ]) {
    for (let version = 1; version < 17; version++)
      assert.throws(() => validateChange(change, version), /version 17/);
    for (const after of ['invalid', false, null])
      assert.throws(() => validateChange({ ...change, after }));
    assert.equal(store.change(change), true);
  }
  await store.flush();
  store = new ChangeStore(repo, meta);
  await store.load();
  assert.equal(store.getSnapshot().replay.state.nameColumnWidth, 'narrow');
  assert.equal(
    effectiveColumnSpacing(store.getSnapshot().replay.state),
    'compact',
  );
  assert.deepEqual(
    store.getSnapshot().replay.redo.map((item) => item.undoId),
    redo,
  );
  assert.equal(store.getSnapshot().replay.undo.length, 0);
  const events = store.getSnapshot().events;
  const backup = await encodeArchive(
    events,
    '2026-10-07T04:00:00.000Z',
    digest,
  );
  const decoded = await decodeArchive(backup, digest);
  assert.equal(JSON.parse(backup).version, 20);
  assert.deepEqual(decoded.events, events);
  await store.exclusive(() => store.replace(decoded.events));
  assert.equal(store.redo(), true);
  assert.equal(store.getSnapshot().replay.state.values['read:2026-10-07'], 30);
  assert.throws(
    () =>
      applyEvent(store.getSnapshot().replay, {
        ...meta(store.getSnapshot().events.length + 1),
        version: 16,
        type: 'preference',
        change: { kind: 'haptics', before: true, after: false },
      }),
    /version-20/,
  );
  const previous = JSON.parse(
    readFileSync(
      new URL('../docs/examples/storage-v16.json', import.meta.url),
      'utf8',
    ),
  );
  const next = await decodeArchive(
    readFileSync(
      new URL('../docs/examples/storage-v17.json', import.meta.url),
      'utf8',
    ),
    digest,
  );
  assert.deepEqual(
    next.events.slice(0, previous.events.length),
    previous.events,
  );
  assert.equal(next.replay.state.nameColumnWidth, 'narrow');
  assert.equal(next.replay.state.columnDensity, 'compact');
  assert.equal(replayEvents(previous.events).replay.hasV17, false);
});
test('quick correction targets its own entry, retains unrelated edits, and invalidates after retouch/restore/archive', async () => {
  const { createSampleStore } = await import('../src/dev/sampleData.ts');
  const store = await createSampleStore('2026-10-07');
  const change = {
    kind: 'entry',
    habitId: 'walk',
    date: '2026-10-08',
    before: null,
    after: 1,
  };
  store.change(change);
  const receipt = {
    change,
    sequence: store.getSnapshot().events.length,
    eventId: store.getSnapshot().events.at(-1).id,
  };
  store.change({
    kind: 'entry',
    habitId: 'read',
    date: '2026-10-08',
    before: null,
    after: 42,
  });
  assert.equal(receiptIsCurrent(store.getSnapshot().events, receipt), true);
  assert.equal(
    store.change(entryCorrection(store.getSnapshot().replay.state, change)),
    true,
  );
  assert.equal(
    store.getSnapshot().replay.state.values['walk:2026-10-08'],
    undefined,
  );
  assert.equal(store.getSnapshot().replay.state.values['read:2026-10-08'], 42);
  assert.equal(receiptIsCurrent(store.getSnapshot().events, receipt), false);
  store.change(change);
  assert.equal(receiptIsCurrent(store.getSnapshot().events, receipt), false);
  assert.equal(receiptIsCurrent([], receipt), false);
  const state = store.getSnapshot().replay.state;
  assert.equal(
    entryCorrection(
      {
        ...state,
        habits: state.habits.map((h) =>
          h.id === 'walk' ? { ...h, archived: true } : h,
        ),
      },
      change,
    ),
    null,
  );
});
