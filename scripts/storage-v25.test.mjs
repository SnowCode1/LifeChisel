// Storage v25: per-habit statistics layouts (docs/STORAGE.md, STATISTICS.md).
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  applyEvent,
  replayEvents,
  validateChange,
} from '../packages/core/src/storage/model.ts';
import { sqliteRepository } from '../packages/core/src/storage/repository.ts';
import { ChangeStore } from '../packages/core/src/storage/store.ts';
import {
  decodeArchive,
  encodeArchive,
} from '../packages/core/src/storage/archive.ts';
import { rebase } from '../packages/core/src/sync/rebase.ts';
import {
  moveStatsSection,
  normalizeStatsLayout,
  setStatsSectionHidden,
  statsLayoutChange,
  statsSections,
  visibleStatsSections,
} from '../packages/core/src/statsLayout.ts';

const digest = async (text) => createHash('sha256').update(text).digest('hex');
const fixture = (version) =>
  readFileSync(
    new URL(`../docs/examples/storage-v${version}.json`, import.meta.url),
    'utf8',
  );
function port(raw) {
  const db = {
    async execAsync(sql) {
      raw.exec(sql);
    },
    async runAsync(sql, ...params) {
      return raw.prepare(sql).run(...params);
    },
    async getFirstAsync(sql, ...params) {
      return raw.prepare(sql).get(...params) ?? null;
    },
    async getAllAsync(sql, ...params) {
      return raw.prepare(sql).all(...params);
    },
    async withExclusiveTransactionAsync(task) {
      raw.exec('BEGIN IMMEDIATE');
      try {
        await task(db);
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return db;
}
const walk = { id: 'walk', name: 'Walk', color: '#82E6BC' };
const sleep = {
  id: 'sleep',
  name: 'Sleep',
  color: '#A6ACFF',
  type: 'number',
  unit: 'hours',
};
let ids = 0;
const meta = (sequence, extra = {}) => ({
  version: 25,
  id: `v25-${++ids}`,
  sequence,
  recordedAt: '2026-10-19T05:00:00.000Z',
  timeZone: 'UTC',
  utcOffsetMinutes: 0,
  device: 'here',
  ...extra,
});
const seed = () => ({ ...meta(1), type: 'initialize', habits: [walk, sleep] });
async function open(raw) {
  const repository = sqliteRepository(
    port(raw),
    (device) => ({ ...seed(), device }),
    { newId: () => 'here' },
  );
  const store = new ChangeStore(repository, (sequence) => meta(sequence));
  await store.load();
  return store;
}
const layoutChange = (habitId, before, after) => ({
  kind: 'statsLayout',
  habitId,
  before,
  after,
});

test('the v25 fixture extends v24 exactly and replays statistics layouts', async () => {
  const previous = await decodeArchive(fixture(24), digest);
  const next = await decodeArchive(fixture(25), digest);
  assert.deepEqual(
    next.events.slice(0, previous.events.length),
    previous.events,
  );
  const added = next.events.slice(previous.events.length);
  assert.ok(
    added.every(
      (event) =>
        event.version === 25 &&
        event.type === 'preference' &&
        event.change.kind === 'statsLayout',
    ),
  );
  assert.deepEqual(next.replay.state.statsLayouts, {
    walk: {
      order: ['calendar', 'success', 'streaks', 'weekday', 'timeOfDay'],
      hidden: ['timeOfDay'],
    },
  });
  // Layouts are shared by every device and never enter History.
  const phone = replayEvents(next.events, { localDevice: 'example-phone' });
  assert.deepEqual(
    phone.replay.state.statsLayouts,
    next.replay.state.statsLayouts,
  );
  assert.equal(next.replay.undo.length, previous.replay.undo.length);
  const encoded = JSON.parse(
    await encodeArchive(next.events, '2026-10-19T09:30:00.000Z', digest),
  );
  assert.equal(encoded.sha256, JSON.parse(fixture(25)).sha256);
  assert.equal(encoded.version, 25);
});

test('statistics layouts validate their exact shape and need version 25', () => {
  const good = layoutChange('walk', null, {
    order: ['calendar'],
    hidden: ['timeOfDay'],
    combine: 'average',
  });
  validateChange(good, 25);
  assert.throws(() => validateChange(good, 24), /require version 25/);
  validateChange(layoutChange('walk', { hidden: ['streaks'] }, null), 25);
  for (const after of [
    {},
    { order: [] },
    { order: ['calendar', 'calendar'] },
    { order: ['notes'] },
    { hidden: ['values', 'nope'] },
    { combine: 'median' },
    { combine: 'total', extra: true },
    ['calendar'],
  ])
    assert.throws(
      () => validateChange(layoutChange('walk', null, after), 25),
      /Invalid statistics layout/,
    );
  assert.throws(
    () =>
      validateChange(
        { ...layoutChange('walk', null, { combine: 'lowest' }), extra: 1 },
        25,
      ),
    /Unexpected|fields/,
  );
  assert.throws(
    () =>
      validateChange(
        layoutChange('walk', { combine: 'lowest' }, { combine: 'lowest' }),
        25,
      ),
    /must change a value/,
  );
});

test('a layout is a preference: saved, reloaded and backed up outside History, keeping Redo', async () => {
  const raw = new DatabaseSync(':memory:');
  const store = await open(raw);
  store.change({
    kind: 'entry',
    habitId: 'sleep',
    date: '2026-10-18',
    before: null,
    after: 8,
  });
  store.undo();
  await store.flush();
  const redo = store.getSnapshot().replay.redo.length;
  assert.equal(redo, 1);
  const state = () => store.getSnapshot().replay.state;
  const first = statsLayoutChange(state(), sleep, { combine: 'average' });
  assert.deepEqual(first, layoutChange('sleep', null, { combine: 'average' }));
  assert.ok(store.change(first));
  const second = statsLayoutChange(
    state(),
    sleep,
    setStatsSectionHidden(state().statsLayouts.sleep, 'streaks', true),
  );
  assert.ok(store.change(second));
  await store.flush();
  assert.deepEqual(state().statsLayouts, {
    sleep: { hidden: ['streaks'], combine: 'average' },
  });
  assert.equal(store.getSnapshot().replay.redo.length, redo);
  assert.equal(store.getSnapshot().replay.undo.length, 0);
  // Unchanged edits save nothing; a stale before-value is refused.
  assert.equal(
    statsLayoutChange(state(), sleep, {
      combine: 'average',
      hidden: ['streaks'],
    }),
    null,
  );
  assert.throws(
    () =>
      applyEvent(store.getSnapshot().replay, {
        ...meta(store.getSnapshot().events.length + 1),
        type: 'preference',
        change: layoutChange('sleep', null, { combine: 'total' }),
      }),
    /precondition/,
  );
  const reopened = await open(raw);
  assert.deepEqual(
    reopened.getSnapshot().replay.state.statsLayouts,
    state().statsLayouts,
  );
  const backup = await encodeArchive(
    reopened.getSnapshot().events,
    '2026-10-19T06:00:00.000Z',
    digest,
  );
  const decoded = await decodeArchive(backup, digest);
  assert.deepEqual(decoded.replay, reopened.getSnapshot().replay);
  // Reset to the default removes the habit's entry entirely.
  assert.ok(store.change(statsLayoutChange(state(), sleep, null)));
  await store.flush();
  assert.equal(state().statsLayouts, undefined);
});

test('older events cannot follow v25 ones', () => {
  const { replay } = replayEvents([seed()]);
  assert.throws(
    () =>
      applyEvent(replay, {
        ...meta(2),
        version: 24,
        type: 'preference',
        change: { kind: 'haptics', before: true, after: false },
      }),
    /version-25/,
  );
});

test('sections follow the saved order and type, and default layouts save nothing', () => {
  assert.deepEqual(visibleStatsSections(walk), [
    'success',
    'streaks',
    'calendar',
    'weekday',
    'timeOfDay',
  ]);
  assert.deepEqual(visibleStatsSections(sleep).slice(0, 2), [
    'values',
    'success',
  ]);
  const text = { ...walk, type: 'text' };
  assert.ok(!visibleStatsSections(text).includes('weekday'));
  // Missing sections follow in default order; other types' ids are kept.
  const layout = { order: ['calendar', 'values'], hidden: ['streaks'] };
  assert.deepEqual(
    statsSections(walk, layout).map((section) => section.id),
    ['calendar', 'success', 'streaks', 'weekday', 'timeOfDay'],
  );
  assert.deepEqual(normalizeStatsLayout(walk, layout), {
    order: ['calendar', 'success', 'streaks', 'weekday', 'timeOfDay', 'values'],
    hidden: ['streaks'],
  });
  assert.equal(
    normalizeStatsLayout(sleep, { combine: 'total', hidden: [] }),
    null,
  );
  let moved = moveStatsSection(sleep, null, 'calendar', -1);
  moved = moveStatsSection(sleep, moved, 'calendar', -1);
  assert.deepEqual(visibleStatsSections(sleep, moved).slice(0, 3), [
    'values',
    'calendar',
    'success',
  ]);
  // Moving back restores the default, which saves as nothing.
  moved = moveStatsSection(sleep, moved, 'calendar', 1);
  moved = moveStatsSection(sleep, moved, 'calendar', 1);
  assert.equal(normalizeStatsLayout(sleep, moved), null);
  assert.deepEqual(
    moveStatsSection(sleep, null, 'values', -1),
    {},
    'the first section cannot move up',
  );
});

test('sync rebases a layout per habit: other habits apply, the later edit of one habit wins', () => {
  const base = [
    seed(),
    {
      ...meta(2, { device: 'there', recordedAt: '2026-10-19T05:10:00.000Z' }),
      type: 'preference',
      change: layoutChange('walk', null, { hidden: ['weekday'] }),
    },
  ];
  const pending = [
    {
      ...meta(2, { recordedAt: '2026-10-19T05:20:00.000Z' }),
      type: 'preference',
      change: layoutChange('walk', null, { hidden: ['timeOfDay'] }),
    },
    {
      ...meta(3, { recordedAt: '2026-10-19T05:20:00.000Z' }),
      type: 'preference',
      change: layoutChange('sleep', null, { combine: 'average' }),
    },
  ];
  const result = rebase({
    base,
    confirmed: 1,
    receivedAt: {},
    pending,
    localDevice: 'here',
    now: new Date('2026-10-19T05:30:00.000Z'),
    newId: () => `new-${++ids}`,
  });
  const { replay } = replayEvents(result.events, { localDevice: 'here' });
  assert.deepEqual(replay.state.statsLayouts, {
    walk: { hidden: ['timeOfDay'] },
    sleep: { combine: 'average' },
  });
  assert.ok(result.events.slice(2).every((event) => event.version === 25));
  // An earlier local edit loses to the later remote one.
  const late = rebase({
    base: [base[0], { ...base[1], recordedAt: '2026-10-19T05:25:00.000Z' }],
    confirmed: 1,
    receivedAt: {},
    pending: [pending[0]],
    localDevice: 'here',
    now: new Date('2026-10-19T05:30:00.000Z'),
    newId: () => `new-${++ids}`,
  });
  assert.deepEqual(replayEvents(late.events).replay.state.statsLayouts, {
    walk: { hidden: ['weekday'] },
  });
});
