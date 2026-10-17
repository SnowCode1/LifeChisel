import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { ChangeStore } from '../packages/core/src/storage/store.ts';
import { sqliteRepository } from '../packages/core/src/storage/repository.ts';
import {
  encodeArchive,
  decodeArchive,
} from '../packages/core/src/storage/archive.ts';
import {
  applyChange,
  applyEvent,
  describeChange,
  inverse,
  replayEvents,
  validateChange,
} from '../packages/core/src/storage/model.ts';
import { eventMeta } from '../packages/core/src/storage/newEvents.ts';
import {
  checkboxFill,
  fillDates,
  fillRange,
  fillSummary,
  valueFill,
} from '../packages/core/src/entryFill.ts';
import {
  historyCalendar,
  historyDays,
  historyKind,
  historyMatches,
  historyPresentation,
  historyRows,
} from '../packages/core/src/history.ts';
import {
  entryCorrection,
  receiptIsCurrent,
} from '../packages/core/src/quickEntryUndo.ts';
import { createQuickUndo } from '../packages/core/src/quickUndo.ts';
import { allWeekdays } from '../packages/core/src/habitGoals.ts';

const digest = async (text) => createHash('sha256').update(text).digest('hex');
const walk = {
  id: 'walk',
  name: 'Walk',
  color: '#82E6BC',
  type: 'checkbox',
  startDate: '2026-10-01',
};
const read = {
  id: 'read',
  name: 'Read',
  color: '#BDA5FF',
  type: 'number',
  unit: 'min',
};
const mood = {
  id: 'mood',
  name: 'Mood',
  color: '#FFB86B',
  type: 'categorical',
  categories: [
    { id: 'calm', label: 'Calm' },
    { id: 'happy', label: 'Happy' },
  ],
};
const fill = (habitId, before, after) => ({
  kind: 'entries',
  habitId,
  before,
  after,
});
const ticked = fill(
  'walk',
  { '2026-10-06': null, '2026-10-07': null, '2026-10-08': null },
  { '2026-10-06': 1, '2026-10-07': 1, '2026-10-08': 1 },
);

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
async function storeFixture(t, habits = [walk, read, mood]) {
  const raw = new DatabaseSync(':memory:');
  t.after(() => raw.close());
  let id = 0;
  let clock = Date.parse('2026-10-14T04:00:00.000Z');
  const meta = (sequence) => ({
    version: 23,
    id: `fill_${++id}`,
    sequence,
    // Ten seconds apart: well inside the two-minute grouping window.
    recordedAt: new Date((clock += 10_000)).toISOString(),
    timeZone: 'UTC',
    utcOffsetMinutes: 0,
  });
  const repo = sqliteRepository(sqlPort(raw), () => ({
    ...meta(1),
    type: 'initialize',
    habits,
  }));
  const store = new ChangeStore(repo, meta);
  await store.load();
  return { store, repo, meta };
}

test('the writer version is 23 and fills validate their exact shape', () => {
  assert.equal(eventMeta(1, 'x').version, 23);
  validateChange(ticked);
  validateChange(
    fill(
      'mood',
      { '2026-10-06': ['calm'], '2026-10-07': null },
      { '2026-10-06': null, '2026-10-07': ['calm', 'happy'] },
    ),
  );
  for (let version = 1; version < 22; version++)
    assert.throws(() => validateChange(ticked, version), /version 22/);
  const invalid = [
    // Mismatched dates.
    fill(
      'walk',
      { '2026-10-06': null, '2026-10-07': null },
      { '2026-10-06': 1, '2026-10-08': 1 },
    ),
    fill(
      'walk',
      { '2026-10-06': null, '2026-10-07': null },
      { '2026-10-06': 1, '2026-10-07': 1, '2026-10-08': 1 },
    ),
    // One date is an ordinary entry change.
    fill('walk', { '2026-10-06': null }, { '2026-10-06': 1 }),
    fill('walk', {}, {}),
    // Every date must change, arrays compared by value.
    fill(
      'walk',
      { '2026-10-06': null, '2026-10-07': 1 },
      { '2026-10-06': 1, '2026-10-07': 1 },
    ),
    fill(
      'mood',
      { '2026-10-06': null, '2026-10-07': ['calm'] },
      { '2026-10-06': ['calm'], '2026-10-07': ['calm'] },
    ),
    // Invalid dates and values.
    fill(
      'walk',
      { '2026-02-30': null, '2026-10-07': null },
      { '2026-02-30': 1, '2026-10-07': 1 },
    ),
    fill(
      'walk',
      { '2026-10-06': null, '2026-10-07': null },
      { '2026-10-06': -1, '2026-10-07': 1 },
    ),
    fill(
      'mood',
      { '2026-10-06': null, '2026-10-07': null },
      { '2026-10-06': ['happy', 'calm'], '2026-10-07': ['calm'] },
    ),
    fill('bad id', ticked.before, ticked.after),
    { ...ticked, date: '2026-10-06' },
    { ...ticked, before: [null, null] },
  ];
  for (const change of invalid) assert.throws(() => validateChange(change));
  // The bound keeps one action small.
  const many = fillDates('2016-01-01', '2026-12-31');
  assert.ok(many.length > 3660);
  assert.throws(
    () =>
      validateChange(
        fill(
          'walk',
          Object.fromEntries(many.map((date) => [date, null])),
          Object.fromEntries(many.map((date) => [date, 1])),
        ),
      ),
    /2 to 3660/,
  );
  assert.throws(() => checkboxFill(walk, {}, many, true), /3660/);
});

test('fills apply after exact preconditions and fit the habit type', () => {
  const state = {
    habits: [walk, read, mood],
    values: { 'walk:2026-10-07': 0, 'read:2026-10-06': 10 },
    hapticsEnabled: true,
  };
  // Stored 0 is not absent.
  assert.throws(() => applyChange(state, ticked), /precondition/);
  const change = fill(
    'walk',
    { '2026-10-06': null, '2026-10-07': 0, '2026-10-08': null },
    { '2026-10-06': 1, '2026-10-07': 1, '2026-10-08': 1 },
  );
  const next = applyChange(state, change);
  assert.deepEqual(next.values, {
    'walk:2026-10-06': 1,
    'walk:2026-10-07': 1,
    'walk:2026-10-08': 1,
    'read:2026-10-06': 10,
  });
  // The live state is not mutated, and the inverse restores it exactly.
  assert.equal(state.values['walk:2026-10-06'], undefined);
  assert.deepEqual(applyChange(next, inverse(change)), state);
  assert.throws(() => applyChange(next, change), /precondition/);
  // Values must fit the habit, as for one entry.
  assert.throws(
    () =>
      applyChange(
        state,
        fill(
          'read',
          { '2026-10-06': 10, '2026-10-07': null },
          { '2026-10-06': 'ten', '2026-10-07': 'ten' },
        ),
      ),
    /does not match/,
  );
  assert.throws(
    () =>
      applyChange(
        state,
        fill(
          'mood',
          { '2026-10-06': null, '2026-10-07': null },
          { '2026-10-06': ['sad'], '2026-10-07': ['sad'] },
        ),
      ),
    /does not match/,
  );
  assert.throws(
    () => applyChange(state, { ...ticked, habitId: 'missing' }),
    /Unknown habit/,
  );
  assert.equal(describeChange(change, state), 'Walk · Checked 3 days');
});

test('a fill is one Undo/Redo step, never coalesces, and survives SQLite and backups', async (t) => {
  const { store, repo, meta } = await storeFixture(t);
  assert.equal(
    store.change({
      kind: 'entry',
      habitId: 'walk',
      date: '2026-10-06',
      before: null,
      after: 1,
    }),
    true,
  );
  // A fill right after an entry for the same habit starts its own action.
  const first = fill(
    'walk',
    { '2026-10-07': null, '2026-10-08': null },
    { '2026-10-07': 1, '2026-10-08': 1 },
  );
  assert.equal(store.change(first), true);
  const events = () => store.getSnapshot().events;
  assert.equal(events().at(-1).groupId, events().at(-1).id);
  // A second fill moments later is another action, never merged.
  const second = fill(
    'walk',
    { '2026-10-07': 1, '2026-10-08': 1 },
    { '2026-10-07': null, '2026-10-08': null },
  );
  assert.equal(store.change(second), true);
  assert.equal(events().at(-1).groupId, events().at(-1).id);
  // An entry after a fill is not merged into it either.
  assert.equal(
    store.change({
      kind: 'entry',
      habitId: 'walk',
      date: '2026-10-08',
      before: null,
      after: 1,
    }),
    true,
  );
  assert.equal(events().at(-1).groupId, events().at(-1).id);
  assert.equal(store.getSnapshot().replay.undo.length, 4);
  assert.equal(store.getSnapshot().replay.lastGroup.change.kind, 'entry');

  assert.equal(store.undo(), true);
  assert.equal(store.undo(), true);
  // Undoing the second fill restores both days in one step.
  let values = store.getSnapshot().replay.state.values;
  assert.equal(values['walk:2026-10-07'], 1);
  assert.equal(values['walk:2026-10-08'], 1);
  assert.equal(store.undo(), true);
  values = store.getSnapshot().replay.state.values;
  assert.equal(values['walk:2026-10-07'], undefined);
  assert.equal(values['walk:2026-10-08'], undefined);
  assert.equal(values['walk:2026-10-06'], 1);
  assert.deepEqual(events().at(-1).change, inverse(first));
  assert.equal(store.redo(), true);
  assert.deepEqual(events().at(-1).change, first);
  values = store.getSnapshot().replay.state.values;
  assert.equal(values['walk:2026-10-07'], 1);
  assert.equal(values['walk:2026-10-08'], 1);
  assert.equal(store.getSnapshot().replay.undo.length, 2);
  assert.equal(store.getSnapshot().replay.redo.length, 2);

  // A wrong inverse cannot pose as the fill's undo.
  assert.throws(
    () =>
      applyEvent(store.getSnapshot().replay, {
        ...meta(events().length + 1),
        type: 'undo',
        targetId: store.getSnapshot().replay.undo.at(-1).id,
        change: fill(
          'walk',
          { '2026-10-07': 1, '2026-10-08': 1 },
          { '2026-10-07': null, '2026-10-08': 0 },
        ),
      }),
    /undo target or inverse/,
  );
  // Older events cannot follow a v22 event, and v21 cannot carry a fill.
  assert.throws(
    () =>
      applyEvent(store.getSnapshot().replay, {
        ...meta(events().length + 1),
        version: 21,
        type: 'preference',
        change: { kind: 'haptics', before: true, after: false },
      }),
    /version-23/,
  );
  const v21 = replayEvents([
    { ...meta(1), version: 21, type: 'initialize', habits: [walk] },
  ]).replay;
  assert.throws(
    () =>
      applyEvent(v21, {
        ...meta(2),
        version: 21,
        type: 'change',
        groupId: 'fill_v21',
        id: 'fill_v21',
        change: ticked,
      }),
    /version 22/,
  );

  await store.flush();
  const reopened = new ChangeStore(repo, meta);
  await reopened.load();
  assert.deepEqual(reopened.getSnapshot().events, events());
  assert.deepEqual(
    reopened.getSnapshot().replay.state,
    store.getSnapshot().replay.state,
  );
  const backup = await encodeArchive(
    events(),
    '2026-10-14T06:00:00.000Z',
    digest,
  );
  assert.equal(JSON.parse(backup).version, 23);
  const decoded = await decodeArchive(backup, digest);
  assert.deepEqual(decoded.events, events());
  assert.deepEqual(decoded.replay.state, store.getSnapshot().replay.state);
  // A v21 manifest cannot carry v22 events.
  const old = JSON.parse(backup);
  old.version = 21;
  await assert.rejects(
    decodeArchive(JSON.stringify(old), digest),
    /version does not support/,
  );
});

test('the v22 fixture extends v21 exactly and replays its fills', async () => {
  const previous = JSON.parse(
    readFileSync(
      new URL('../docs/examples/storage-v21.json', import.meta.url),
      'utf8',
    ),
  );
  const next = await decodeArchive(
    readFileSync(
      new URL('../docs/examples/storage-v22.json', import.meta.url),
      'utf8',
    ),
    digest,
  );
  assert.deepEqual(
    next.events.slice(0, previous.events.length),
    previous.events,
  );
  const added = next.events.slice(previous.events.length);
  assert.ok(added.every((event) => event.version === 22));
  assert.ok(added.some((event) => event.change.kind === 'entries'));
  assert.ok(added.some((event) => event.type === 'undo'));
  const { state, undo, hasV22 } = next.replay;
  assert.equal(hasV22, true);
  assert.equal(replayEvents(previous.events).replay.hasV22, false);
  for (const date of ['2026-10-06', '2026-10-07', '2026-10-08'])
    assert.equal(state.values[`walk:${date}`], 1);
  assert.equal(state.values['highlight:2026-10-09'], 'Rest day');
  assert.equal(state.values['highlight:2026-10-08'], 'Rest day');
  assert.equal(undo.at(-1).change.kind, 'entries');
  assert.equal(undo.at(-2).change.kind, 'entries');
});

test('History shows one row per fill, matched by habit and never merged into bursts', () => {
  const recordedAt = '2026-10-14T05:00:00.000Z';
  const action = (id, change, at = recordedAt) => ({
    version: 22,
    id,
    sequence: 2,
    recordedAt: at,
    timeZone: 'UTC',
    utcOffsetMinutes: 0,
    type: 'change',
    change,
    firstRecordedAt: at,
    firstSequence: 2,
    editCount: 1,
    lastChangedSequence: 2,
  });
  const state = {
    habits: [walk, read, mood],
    values: {},
    hapticsEnabled: true,
  };
  const row = historyPresentation(action('a', ticked), state);
  assert.equal(row.title, 'Walk');
  assert.equal(row.icon, 'checked');
  assert.equal(row.effectiveDate, null);
  assert.match(row.summary, /^Checked 3 days · .*6.*8/);

  const cleared = fill(
    'walk',
    { '2026-10-06': 1, '2026-10-07': 1 },
    { '2026-10-06': null, '2026-10-07': null },
  );
  assert.match(
    historyPresentation(action('b', cleared), state).summary,
    /^Unchecked 2 days · /,
  );
  const minutes = fill(
    'read',
    { '2026-10-06': null, '2026-10-07': 5 },
    { '2026-10-06': 30, '2026-10-07': 30 },
  );
  const numeric = historyPresentation(action('c', minutes), state);
  assert.match(numeric.summary, /^30 min on 2 days · /);
  assert.equal(numeric.icon, 'number');
  const erased = historyPresentation(action('d', inverse(minutes)), state);
  assert.equal(erased.summary.startsWith('Changed 2 days'), true);
  const emptied = fill(
    'read',
    { '2026-10-06': 30, '2026-10-07': 30 },
    { '2026-10-06': null, '2026-10-07': null },
  );
  const clearedRow = historyPresentation(action('e', emptied), state);
  assert.match(clearedRow.summary, /^Cleared 2 days · /);
  assert.equal(clearedRow.icon, 'erase');
  const categories = fill(
    'mood',
    { '2026-10-06': null, '2026-10-07': null },
    { '2026-10-06': ['calm', 'happy'], '2026-10-07': ['calm', 'happy'] },
  );
  assert.match(
    historyPresentation(action('f', categories), state).summary,
    /^Calm, Happy on 2 days · /,
  );
  // A range in another year names the year.
  assert.match(
    historyPresentation(
      action(
        'g',
        fill(
          'walk',
          { '2025-12-31': null, '2026-01-01': null },
          { '2025-12-31': 1, '2026-01-01': 1 },
        ),
      ),
      state,
    ).summary,
    /2025/,
  );
  assert.deepEqual(
    fillRange(
      fill(
        'walk',
        { '2026-10-09': null, '2026-10-07': null },
        { '2026-10-09': 1, '2026-10-07': 1 },
      ),
    ),
    {
      from: '2026-10-07',
      to: '2026-10-09',
    },
  );
  assert.deepEqual(fillSummary(undefined, ticked), {
    summary: 'Changed 3 days',
    icon: 'tick',
  });

  // Fills count as entries and match their habit filter.
  const filled = action('h', ticked);
  assert.equal(historyKind(filled), 'entries');
  assert.equal(
    historyMatches(filled, { kind: 'entries', habitId: 'walk' }),
    true,
  );
  assert.equal(historyMatches(filled, { kind: 'all', habitId: 'read' }), false);
  assert.equal(historyMatches(filled, { kind: 'edits', habitId: null }), false);

  // A neighbouring entry for one of its dates stays a separate row.
  const entry = action('i', {
    kind: 'entry',
    habitId: 'walk',
    date: '2026-10-08',
    before: 1,
    after: null,
  });
  const rows = historyRows([entry, filled], new Set());
  assert.deepEqual(
    rows.map((item) => item.type),
    ['action', 'action'],
  );

  // One action on the day it was made, counted once for the habit.
  const days = historyDays([filled]).days;
  assert.equal(days.length, 1);
  assert.equal(days[0].actions.length, 1);
  assert.equal(days[0].counts.entries, 1);
  const calendar = historyCalendar([filled]);
  assert.equal(calendar.days.size, 1);
  const [day] = calendar.days.values();
  assert.equal(day.count, 1);
  assert.deepEqual(day.habits, [{ id: 'walk', count: 1 }]);
});

test('Quick Undo captures a fill and reverses every day in one edit', async (t) => {
  const { store } = await storeFixture(t);
  const shortcut = createQuickUndo(store);
  t.after(() => shortcut.dispose());
  const values = () => store.getSnapshot().replay.state.values;
  const change = checkboxFill(
    walk,
    values(),
    fillDates('2026-10-08', '2026-10-06'),
    true,
  );
  assert.equal(change.kind, 'entries');
  assert.equal(store.change(change), true);
  shortcut.capture(change);
  const receipt = shortcut.getSnapshot();
  assert.equal(receipt.action, 'entry');
  assert.equal(receipt.label, 'Walk');
  assert.equal(receiptIsCurrent(store.getSnapshot().events, receipt), true);
  // Unrelated edits leave the receipt current.
  assert.equal(
    store.change({
      kind: 'entry',
      habitId: 'walk',
      date: '2026-10-05',
      before: null,
      after: 1,
    }),
    true,
  );
  assert.equal(
    store.change(
      fill(
        'read',
        { '2026-10-06': null, '2026-10-07': null },
        { '2026-10-06': 5, '2026-10-07': 5 },
      ),
    ),
    true,
  );
  assert.equal(receiptIsCurrent(store.getSnapshot().events, receipt), true);
  assert.equal(shortcut.undo(), true);
  assert.equal(values()['walk:2026-10-06'], undefined);
  assert.equal(values()['walk:2026-10-07'], undefined);
  assert.equal(values()['walk:2026-10-08'], undefined);
  assert.equal(values()['walk:2026-10-05'], 1);
  assert.equal(values()['read:2026-10-06'], 5);
  // The correction is one ordinary appended fill.
  const last = store.getSnapshot().events.at(-1);
  assert.equal(last.type, 'change');
  assert.deepEqual(last.change, inverse(change));
  assert.equal(shortcut.getSnapshot(), null);

  // A later edit to any filled day invalidates the receipt.
  const again = checkboxFill(
    walk,
    values(),
    fillDates('2026-10-06', '2026-10-08'),
    true,
  );
  store.change(again);
  shortcut.capture(again);
  assert.notEqual(shortcut.getSnapshot(), null);
  store.change({
    kind: 'entry',
    habitId: 'walk',
    date: '2026-10-07',
    before: 1,
    after: null,
  });
  assert.equal(shortcut.getSnapshot(), null);
  assert.equal(shortcut.undo(), false);

  // A later fill touching an entry receipt's date invalidates it as well.
  const entry = {
    kind: 'entry',
    habitId: 'walk',
    date: '2026-10-10',
    before: null,
    after: 1,
  };
  store.change(entry);
  shortcut.capture(entry);
  assert.notEqual(shortcut.getSnapshot(), null);
  store.change(
    fill(
      'walk',
      { '2026-10-10': 1, '2026-10-11': null },
      { '2026-10-10': null, '2026-10-11': 1 },
    ),
  );
  assert.equal(shortcut.getSnapshot(), null);
});

test('fill corrections require the active habit and every filled value', () => {
  const state = {
    habits: [walk],
    values: { 'walk:2026-10-06': 1, 'walk:2026-10-07': 1 },
    hapticsEnabled: true,
  };
  const change = fill(
    'walk',
    { '2026-10-06': null, '2026-10-07': 0 },
    { '2026-10-06': 1, '2026-10-07': 1 },
  );
  assert.deepEqual(entryCorrection(state, change), inverse(change));
  assert.equal(
    entryCorrection({ ...state, values: { 'walk:2026-10-06': 1 } }, change),
    null,
  );
  assert.equal(
    entryCorrection(
      { ...state, habits: [{ ...walk, archived: true }] },
      change,
    ),
    null,
  );
  assert.equal(entryCorrection({ ...state, habits: [] }, change), null);
});

test('fill helpers walk either direction and leave unchanged days out', () => {
  assert.deepEqual(fillDates('2026-10-06', '2026-10-08'), [
    '2026-10-06',
    '2026-10-07',
    '2026-10-08',
  ]);
  assert.deepEqual(fillDates('2026-03-01', '2026-02-27'), [
    '2026-03-01',
    '2026-02-28',
    '2026-02-27',
  ]);
  assert.deepEqual(fillDates('2026-10-06', '2026-10-06'), ['2026-10-06']);
  assert.throws(() => fillDates('2026-02-30', '2026-03-01'));

  // Checkboxes: absent and explicit 0 are unchecked without a default.
  const values = { 'walk:2026-10-06': 1, 'walk:2026-10-07': 0 };
  const change = checkboxFill(
    walk,
    values,
    fillDates('2026-10-08', '2026-10-06'),
    true,
  );
  assert.deepEqual(change, {
    kind: 'entries',
    habitId: 'walk',
    before: { '2026-10-08': null, '2026-10-07': 0 },
    after: { '2026-10-08': 1, '2026-10-07': 1 },
  });
  // Drag order is kept.
  assert.deepEqual(Object.keys(change.after), ['2026-10-08', '2026-10-07']);
  assert.deepEqual(
    checkboxFill(walk, values, fillDates('2026-10-06', '2026-10-07'), false),
    {
      kind: 'entry',
      habitId: 'walk',
      date: '2026-10-06',
      before: 1,
      after: null,
    },
  );
  assert.equal(
    checkboxFill(walk, values, ['2026-10-07', '2026-10-09'], false),
    null,
  );

  // With a dated default of checked, ticking clears overrides and clearing
  // writes explicit Off (0).
  const defaulted = {
    ...walk,
    goals: [
      {
        id: 'on',
        from: '2026-10-07',
        rule: { kind: 'checked' },
        weekdays: allWeekdays,
        defaultChecked: true,
      },
    ],
  };
  const dated = { 'walk:2026-10-06': 1, 'walk:2026-10-07': 0 };
  assert.deepEqual(
    checkboxFill(defaulted, dated, fillDates('2026-10-05', '2026-10-08'), true),
    {
      kind: 'entries',
      habitId: 'walk',
      before: { '2026-10-05': null, '2026-10-07': 0 },
      after: { '2026-10-05': 1, '2026-10-07': null },
    },
  );
  assert.deepEqual(
    checkboxFill(
      defaulted,
      dated,
      fillDates('2026-10-05', '2026-10-08'),
      false,
    ),
    {
      kind: 'entries',
      habitId: 'walk',
      before: { '2026-10-06': 1, '2026-10-08': null },
      after: { '2026-10-06': null, '2026-10-08': 0 },
    },
  );

  // Values: equal days (arrays by value) are left out; null clears.
  const moods = {
    'mood:2026-10-06': ['calm', 'happy'],
    'mood:2026-10-07': ['calm'],
  };
  assert.deepEqual(
    valueFill(mood, moods, fillDates('2026-10-06', '2026-10-08'), [
      'calm',
      'happy',
    ]),
    {
      kind: 'entries',
      habitId: 'mood',
      before: { '2026-10-07': ['calm'], '2026-10-08': null },
      after: {
        '2026-10-07': ['calm', 'happy'],
        '2026-10-08': ['calm', 'happy'],
      },
    },
  );
  assert.deepEqual(
    valueFill(
      read,
      { 'read:2026-10-06': 30 },
      ['2026-10-06', '2026-10-07'],
      30,
    ),
    {
      kind: 'entry',
      habitId: 'read',
      date: '2026-10-07',
      before: null,
      after: 30,
    },
  );
  assert.equal(
    valueFill(read, { 'read:2026-10-06': 0 }, ['2026-10-06'], 0),
    null,
  );
  assert.deepEqual(
    valueFill(
      read,
      { 'read:2026-10-06': 0, 'read:2026-10-07': 5 },
      ['2026-10-06', '2026-10-07', '2026-10-08'],
      null,
    ),
    {
      kind: 'entries',
      habitId: 'read',
      before: { '2026-10-06': 0, '2026-10-07': 5 },
      after: { '2026-10-06': null, '2026-10-07': null },
    },
  );
  // Every helper result is a valid change.
  validateChange(change);
});

test('time of day counts each filled day at the fill time', async () => {
  const { entryMinutes } = await import('../packages/core/src/timeOfDay.ts');
  const at = '2026-10-14T05:00:00.000Z';
  const action = (change) => ({
    version: 22,
    id: 'tod',
    sequence: 2,
    recordedAt: at,
    timeZone: 'UTC',
    utcOffsetMinutes: 0,
    type: 'change',
    change,
    firstRecordedAt: at,
    firstSequence: 2,
    editCount: 1,
    lastChangedSequence: 2,
  });
  const days = fill(
    'walk',
    { '2026-10-13': null, '2026-10-14': null },
    { '2026-10-13': 1, '2026-10-14': 1 },
  );
  // Only the day the fill was made on has a same-day time.
  assert.deepEqual(
    [...entryMinutes(walk, [action(days)])],
    [['2026-10-14', 300]],
  );
  assert.deepEqual(
    [...entryMinutes(walk, [action(days), action(inverse(days))])],
    [],
  );
});
