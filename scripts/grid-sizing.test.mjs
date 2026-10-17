import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  gridSizing,
  isGridSize,
  snapGridSize,
  autoNameWidth,
  autoRowHeight,
} from '../packages/core/src/gridSizing.ts';
import { gridLayout } from '../src/gridLayout.ts';
import { ChangeStore } from '../packages/core/src/storage/store.ts';
import { sqliteRepository } from '../packages/core/src/storage/repository.ts';
import {
  encodeArchive,
  decodeArchive,
} from '../packages/core/src/storage/archive.ts';
import {
  applyChange,
  applyEvent,
  replayEvents,
  validateChange,
} from '../packages/core/src/storage/model.ts';

const digest = async (text) => createHash('sha256').update(text).digest('hex');
const habit = { id: 'read', name: 'Read', color: '#BDA5FF', type: 'number' };
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

test('grid sizes accept automatic or stepped points within their ranges', () => {
  for (const [kind, valid, invalid] of [
    ['gridNameWidth', [96, 120, 240, 'auto'], [92, 98, 244, 120.5]],
    ['gridColumnWidth', [40, 44, 80, 'auto'], [38, 41, 82, 44.2]],
    ['gridRowHeight', [40, 48, 80, 'auto'], [38, 47, 82]],
  ]) {
    for (const value of valid) assert.ok(isGridSize(kind, value), value);
    for (const value of [...invalid, null, 'compact', '48', NaN])
      assert.equal(isGridSize(kind, value), false, String(value));
  }
  assert.equal(snapGridSize('gridColumnWidth', 45.2), 46);
  assert.equal(snapGridSize('gridColumnWidth', 12), 40);
  assert.equal(snapGridSize('gridNameWidth', 999), 240);
});

test('automatic sizes keep the iPhone geometry and give a smaller phone four days', () => {
  // 402-point iPhone (366-point grid, 874-point long side).
  assert.equal(Math.round(autoNameWidth(366, 1)), 146);
  assert.equal(autoRowHeight(874), 52);
  assert.equal(gridLayout(366, 1).visibleDays, 4);
  // 360-point Android phone (324-point grid, 800-point long side).
  assert.equal(Math.round(autoNameWidth(324, 1)), 130);
  assert.equal(autoRowHeight(800), 48);
  assert.equal(gridLayout(324, 1).visibleDays, 4);
  // Landscape uses the same long side, so rows do not change on rotation.
  assert.equal(autoRowHeight(Math.max(874, 402)), autoRowHeight(874));
});

test('earlier choices keep applying until a size is chosen; Standard means automatic', () => {
  assert.deepEqual(gridSizing({}, 'standard'), {
    nameWidth: 'auto',
    nameFactor: 1,
    columnWidth: 'auto',
    rowHeight: 'auto',
  });
  assert.deepEqual(
    gridSizing({ nameColumnWidth: 'narrow', rowSpacing: 'roomy' }, 'compact'),
    { nameWidth: 'auto', nameFactor: 0.8, columnWidth: 44, rowHeight: 64 },
  );
  assert.deepEqual(
    gridSizing(
      {
        nameColumnWidth: 'wide',
        rowSpacing: 'compact',
        gridNameWidth: 'auto',
        gridColumnWidth: 52,
        gridRowHeight: 'auto',
      },
      'roomy',
    ),
    { nameWidth: 'auto', nameFactor: 1, columnWidth: 52, rowHeight: 'auto' },
  );
});

test('v18 grid sizes persist in SQLite/backup without changing legacy logs, history or Redo', async (t) => {
  const raw = new DatabaseSync(':memory:');
  t.after(() => raw.close());
  let id = 0;
  const meta = (sequence) => ({
    version: 18,
    id: `size_${++id}`,
    sequence,
    recordedAt: '2026-10-09T04:00:00.000Z',
    timeZone: 'UTC',
    utcOffsetMinutes: 0,
  });
  const repo = sqliteRepository(sqlPort(raw), () => ({
    ...meta(1),
    version: 17,
    type: 'initialize',
    habits: [habit],
  }));
  let store = new ChangeStore(repo, meta);
  await store.load();
  store.change({
    kind: 'entry',
    habitId: habit.id,
    date: '2026-10-09',
    before: null,
    after: 30,
  });
  store.undo();
  const redo = store.getSnapshot().replay.redo.map((item) => item.undoId);
  for (const change of [
    { kind: 'gridNameWidth', before: null, after: 120 },
    { kind: 'gridColumnWidth', before: null, after: 44 },
    { kind: 'gridRowHeight', before: null, after: 48 },
  ]) {
    for (let version = 1; version < 18; version++)
      assert.throws(() => validateChange(change, version), /version 18/);
    for (const after of [null, 'compact', 41, 300])
      assert.throws(() => validateChange({ ...change, after }));
    // The first choice must start from "not chosen" (null).
    assert.throws(
      () =>
        applyChange(store.getSnapshot().replay.state, {
          ...change,
          before: 'auto',
        }),
      /precondition/,
    );
    assert.equal(store.change(change), true);
  }
  // Reset returns to automatic from the saved size.
  assert.equal(
    store.change({ kind: 'gridRowHeight', before: 48, after: 'auto' }),
    true,
  );
  await store.flush();
  store = new ChangeStore(repo, meta);
  await store.load();
  const state = store.getSnapshot().replay.state;
  assert.equal(state.gridNameWidth, 120);
  assert.equal(state.gridColumnWidth, 44);
  assert.equal(state.gridRowHeight, 'auto');
  assert.deepEqual(
    store.getSnapshot().replay.redo.map((item) => item.undoId),
    redo,
  );
  assert.equal(store.getSnapshot().replay.undo.length, 0);
  const events = store.getSnapshot().events;
  const backup = await encodeArchive(
    events,
    '2026-10-09T04:00:00.000Z',
    digest,
  );
  assert.equal(JSON.parse(backup).version, 22);
  const decoded = await decodeArchive(backup, digest);
  assert.deepEqual(decoded.events, events);
  await store.exclusive(() => store.replace(decoded.events));
  assert.equal(store.redo(), true);
  assert.equal(store.getSnapshot().replay.state.values['read:2026-10-09'], 30);
  assert.throws(
    () =>
      applyEvent(store.getSnapshot().replay, {
        ...meta(store.getSnapshot().events.length + 1),
        version: 17,
        type: 'preference',
        change: { kind: 'haptics', before: true, after: false },
      }),
    /version-22/,
  );
  const previous = JSON.parse(
    readFileSync(
      new URL('../docs/examples/storage-v17.json', import.meta.url),
      'utf8',
    ),
  );
  const next = await decodeArchive(
    readFileSync(
      new URL('../docs/examples/storage-v18.json', import.meta.url),
      'utf8',
    ),
    digest,
  );
  assert.deepEqual(
    next.events.slice(0, previous.events.length),
    previous.events,
  );
  assert.equal(next.replay.state.gridNameWidth, 120);
  assert.equal(next.replay.state.gridColumnWidth, 44);
  assert.equal(next.replay.state.gridRowHeight, 'auto');
  assert.equal(replayEvents(previous.events).replay.hasV18, false);
});
