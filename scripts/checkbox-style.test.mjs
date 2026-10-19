import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  isShadedWeek,
  displayDefaults,
  isCheckboxStyle,
} from '../packages/core/src/displayPreferences.ts';
import { ChangeStore } from '../packages/core/src/storage/store.ts';
import { sqliteRepository } from '../packages/core/src/storage/repository.ts';
import {
  validateChange,
  replayEvents,
} from '../packages/core/src/storage/model.ts';
import {
  encodeArchive,
  decodeArchive,
} from '../packages/core/src/storage/archive.ts';
const digest = async (text) => createHash('sha256').update(text).digest('hex');
let id = 0;
const meta = (sequence) => ({
  version: 15,
  id: `style_${++id}`,
  sequence,
  recordedAt: '2026-10-07T02:00:00.000Z',
  timeZone: 'UTC',
  utcOffsetMinutes: 0,
});
const habit = { id: 'walk', name: 'Walk', color: '#82E6BC' };
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
test('checkbox style defaults to boxes and new preference is strictly versioned', () => {
  assert.equal(displayDefaults.checkboxStyle, 'boxes');
  assert.equal(isCheckboxStyle('marks'), true);
  const change = { kind: 'checkboxStyle', before: 'boxes', after: 'marks' };
  assert.doesNotThrow(() => validateChange(change, 15));
  for (let version = 1; version < 15; version++)
    assert.throws(() => validateChange(change, version), /version 15/);
  for (const value of [true, null, 0, 'checkbox', 'ticks']) {
    assert.equal(isCheckboxStyle(value), false);
    assert.throws(() => validateChange({ ...change, after: value }));
  }
});
test('style reload/backup persist while preserving Undo, Redo and entry grouping', async (t) => {
  const raw = new DatabaseSync(':memory:');
  t.after(() => raw.close());
  const repo = sqliteRepository(port(raw), () => ({
    ...meta(1),
    version: 14,
    type: 'initialize',
    habits: [habit],
  }));
  let store = new ChangeStore(repo, meta);
  await store.load();
  assert.equal(
    store.getSnapshot().replay.state.checkboxStyle ??
      displayDefaults.checkboxStyle,
    'boxes',
  );
  const entry = (before, after) =>
    store.change({
      kind: 'entry',
      habitId: 'walk',
      date: '2026-10-07',
      before,
      after,
    });
  entry(null, 1);
  store.undo();
  const redo = store.getSnapshot().replay.redo.map((e) => e.id);
  assert.equal(
    store.change({ kind: 'checkboxStyle', before: 'boxes', after: 'marks' }),
    true,
  );
  assert.deepEqual(
    store.getSnapshot().replay.redo.map((e) => e.id),
    redo,
  );
  assert.equal(store.getSnapshot().replay.undo.length, 0);
  await store.flush();
  store = new ChangeStore(repo, meta);
  await store.load();
  assert.equal(store.getSnapshot().replay.state.checkboxStyle, 'marks');
  store.redo();
  assert.equal(store.getSnapshot().replay.state.values['walk:2026-10-07'], 1);
  entry(1, null);
  store.change({ kind: 'checkboxStyle', before: 'marks', after: 'boxes' });
  entry(null, 1);
  assert.equal(store.getSnapshot().replay.undo.length, 1);
  await store.flush();
  const events = store.getSnapshot().events;
  const backup = await encodeArchive(
      events,
      '2026-10-07T02:00:00.000Z',
      digest,
    ),
    decoded = await decodeArchive(backup, digest);
  assert.equal(JSON.parse(backup).version, 24);
  await store.exclusive(() => store.replace(decoded.events));
  assert.equal(store.getSnapshot().replay.state.checkboxStyle, 'boxes');
  assert.deepEqual(store.getSnapshot().events, events);
  assert.throws(
    () =>
      replayEvents([
        ...events,
        {
          ...meta(events.length + 1),
          version: 14,
          type: 'preference',
          change: { kind: 'haptics', before: true, after: false },
        },
      ]),
    /version-24/,
  );
});
test('week shading follows fixed Monday/Sunday weeks across year, leap day, DST and pre-epoch dates', () => {
  const shift = (key, offset) => {
    const date = new Date(`${key}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  for (const [monday, sunday] of [
    ['2026-10-05', '2026-10-04'],
    ['2024-02-26', '2024-02-25'],
    ['2025-12-29', '2025-12-28'],
    ['2026-03-09', '2026-03-08'],
    ['1969-12-29', '1969-12-28'],
  ]) {
    for (const [start, anchor] of [
      ['monday', monday],
      ['sunday', sunday],
    ]) {
      const shade = isShadedWeek(anchor, start);
      for (let day = 0; day < 7; day++) {
        assert.equal(isShadedWeek(shift(anchor, day), start), shade);
        assert.equal(isShadedWeek(shift(anchor, day + 7), start), !shade);
        assert.equal(isShadedWeek(shift(anchor, day - 7), start), !shade);
        assert.equal(isShadedWeek(shift(anchor, day + 14), start), shade);
      }
    }
  }
  assert.notEqual(
    isShadedWeek('2026-10-04', 'monday'),
    isShadedWeek('2026-10-04', 'sunday'),
  );
  assert.equal(
    isShadedWeek('2026-10-05', 'monday'),
    isShadedWeek('2026-10-05', 'sunday'),
  );
});
test('v15 example retains the exact v14 event prefix', async () => {
  const previous = JSON.parse(
    readFileSync(
      new URL('../docs/examples/storage-v14.json', import.meta.url),
      'utf8',
    ),
  );
  const next = await decodeArchive(
    readFileSync(
      new URL('../docs/examples/storage-v15.json', import.meta.url),
      'utf8',
    ),
    digest,
  );
  assert.deepEqual(
    next.events.slice(0, previous.events.length),
    previous.events,
  );
  assert.equal(next.replay.state.checkboxStyle, 'marks');
});

test('week dividers and tap animations default on, validate strictly and survive reload/restore without clearing Redo', async (t) => {
  const raw = new DatabaseSync(':memory:');
  t.after(() => raw.close());
  const repo = sqliteRepository(port(raw), () => ({
    ...meta(1),
    version: 15,
    type: 'initialize',
    habits: [habit],
  }));
  let store = new ChangeStore(repo, meta);
  await store.load();
  store.change({
    kind: 'entry',
    habitId: 'walk',
    date: '2026-10-07',
    before: null,
    after: 1,
  });
  store.undo();
  const redo = store.getSnapshot().replay.redo.map((e) => e.id);
  for (const kind of ['weekDividers', 'tapAnimations']) {
    assert.equal(displayDefaults[kind], true);
    assert.equal(
      store.getSnapshot().replay.state[kind] ?? displayDefaults[kind],
      true,
    );
    const change = { kind, before: true, after: false };
    for (let version = 1; version < 16; version++)
      assert.throws(() => validateChange(change, version), /version 16/);
    for (const after of [null, 0, 'off'])
      assert.throws(() => validateChange({ ...change, after }));
    assert.equal(store.change(change), true);
  }
  assert.deepEqual(
    store.getSnapshot().replay.redo.map((e) => e.id),
    redo,
  );
  assert.equal(store.getSnapshot().replay.undo.length, 0);
  await store.flush();
  store = new ChangeStore(repo, meta);
  await store.load();
  for (const kind of ['weekDividers', 'tapAnimations'])
    assert.equal(store.getSnapshot().replay.state[kind], false);
  const archive = await encodeArchive(
    store.getSnapshot().events,
    '2026-10-07T02:00:00.000Z',
    digest,
  );
  const decoded = await decodeArchive(archive, digest);
  await store.exclusive(() => store.replace(decoded.events));
  store.redo();
  assert.equal(store.getSnapshot().replay.state.values['walk:2026-10-07'], 1);
  for (const kind of ['weekDividers', 'tapAnimations'])
    assert.equal(store.getSnapshot().replay.state[kind], false);
  await store.flush();
});
test('v16 example retains the exact v15 event prefix', async () => {
  const previous = JSON.parse(
    readFileSync(
      new URL('../docs/examples/storage-v15.json', import.meta.url),
      'utf8',
    ),
  );
  const next = await decodeArchive(
    readFileSync(
      new URL('../docs/examples/storage-v16.json', import.meta.url),
      'utf8',
    ),
    digest,
  );
  assert.deepEqual(
    next.events.slice(0, previous.events.length),
    previous.events,
  );
  assert.equal(next.replay.state.weekDividers, false);
  assert.equal(next.replay.state.tapAnimations, false);
});
