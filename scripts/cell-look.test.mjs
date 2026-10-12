import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { ChangeStore } from '../src/storage/store.ts';
import { sqliteRepository } from '../src/storage/repository.ts';
import { encodeArchive, decodeArchive } from '../src/storage/archive.ts';
import {
  applyChange,
  applyEvent,
  replayEvents,
  validateChange,
} from '../src/storage/model.ts';
import {
  cellLookDefaults,
  cellLookOf,
  isConnectorThickness,
} from '../src/displayPreferences.ts';

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

test('v20 cell look preferences persist in SQLite/backup outside History and Redo', async (t) => {
  const raw = new DatabaseSync(':memory:');
  t.after(() => raw.close());
  let id = 0;
  const meta = (sequence) => ({
    version: 20,
    id: `look_${++id}`,
    sequence,
    recordedAt: '2026-10-12T04:00:00.000Z',
    timeZone: 'UTC',
    utcOffsetMinutes: 0,
  });
  const repo = sqliteRepository(sqlPort(raw), () => ({
    ...meta(1),
    version: 19,
    type: 'initialize',
    habits: [habit],
  }));
  let store = new ChangeStore(repo, meta);
  await store.load();
  store.change({
    kind: 'entry',
    habitId: habit.id,
    date: '2026-10-12',
    before: null,
    after: 20,
  });
  store.undo();
  const redo = store.getSnapshot().replay.redo.map((item) => item.undoId);
  // `before` is null until the first choice, independent of the defaults.
  const changes = [
    { kind: 'todayOutlines', before: null, after: true },
    { kind: 'missedDays', before: null, after: true },
    { kind: 'joinedCheckboxes', before: null, after: true },
    { kind: 'streakNumbers', before: null, after: true },
    { kind: 'roundCheckboxes', before: null, after: true },
    { kind: 'connectorThickness', before: null, after: 45 },
  ];
  for (const change of changes) {
    for (let version = 1; version < 20; version++)
      assert.throws(() => validateChange(change, version), /version 20/);
    assert.throws(
      () =>
        applyChange(store.getSnapshot().replay.state, {
          ...change,
          // A non-null before: the default is not a stored value.
          before:
            typeof change.after === 'boolean'
              ? !change.after
              : cellLookDefaults.connectorThickness,
        }),
      /precondition/,
    );
    assert.equal(store.change(change), true);
    assert.throws(
      () => applyChange(store.getSnapshot().replay.state, change),
      /precondition/,
    );
  }
  assert.equal(
    store.change({ kind: 'connectorThickness', before: 45, after: 60 }),
    true,
  );
  for (const invalid of [
    { kind: 'todayOutlines', before: true, after: 'yes' },
    { kind: 'missedDays', before: null, after: null },
    { kind: 'connectorThickness', before: 60, after: 62 },
    { kind: 'connectorThickness', before: 60, after: 15 },
    { kind: 'connectorThickness', before: 60, after: 105 },
    { kind: 'connectorThickness', before: 60, after: 0.55 },
    { kind: 'streakNumbers', before: null, after: true, extra: 1 },
  ])
    assert.throws(() => validateChange(invalid));
  assert.equal(isConnectorThickness(20), true);
  assert.equal(isConnectorThickness(100), true);

  await store.flush();
  store = new ChangeStore(repo, meta);
  await store.load();
  const state = store.getSnapshot().replay.state;
  // Outlines only on Today was retired: still replayed, no longer drawn.
  assert.equal(state.todayOutlines, true);
  assert.deepEqual(cellLookOf(state), {
    missedDays: true,
    joinedCheckboxes: true,
    streakNumbers: true,
    roundCheckboxes: true,
    connectorThickness: 60,
  });
  assert.deepEqual(
    store.getSnapshot().replay.redo.map((item) => item.undoId),
    redo,
  );
  assert.equal(store.getSnapshot().replay.undo.length, 0);
  const events = store.getSnapshot().events;
  const backup = await encodeArchive(
    events,
    '2026-10-12T04:00:00.000Z',
    digest,
  );
  assert.equal(JSON.parse(backup).version, 20);
  const decoded = await decodeArchive(backup, digest);
  assert.deepEqual(decoded.events, events);
  await store.exclusive(() => store.replace(decoded.events));
  assert.equal(store.redo(), true);
  assert.equal(store.getSnapshot().replay.state.values['read:2026-10-12'], 20);
  assert.throws(
    () =>
      applyEvent(store.getSnapshot().replay, {
        ...meta(store.getSnapshot().events.length + 1),
        version: 19,
        type: 'preference',
        change: { kind: 'haptics', before: true, after: false },
      }),
    /version-20/,
  );

  const previous = JSON.parse(
    readFileSync(
      new URL('../docs/examples/storage-v19.json', import.meta.url),
      'utf8',
    ),
  );
  const next = await decodeArchive(
    readFileSync(
      new URL('../docs/examples/storage-v20.json', import.meta.url),
      'utf8',
    ),
    digest,
  );
  assert.deepEqual(
    next.events.slice(0, previous.events.length),
    previous.events,
  );
  assert.equal(next.replay.state.joinedCheckboxes, true);
  assert.equal(next.replay.state.connectorThickness, 50);
  const old = replayEvents(previous.events).replay;
  assert.equal(old.hasV20, false);
  // Absent fields display the defaults.
  assert.deepEqual(cellLookOf(old.state), cellLookDefaults);
});
