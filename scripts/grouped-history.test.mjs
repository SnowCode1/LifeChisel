import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ChangeStore } from '../packages/core/src/storage/store.ts';
import { applyPresetIcons } from '../packages/core/src/storage/presetIcons.ts';
import { demoHabits } from '../packages/core/src/habits.ts';
import {
  replayEvents,
  applyEvent,
} from '../packages/core/src/storage/model.ts';
import { sqliteRepository } from '../packages/core/src/storage/repository.ts';
import {
  encodeArchive,
  decodeArchive,
} from '../packages/core/src/storage/archive.ts';

const habits = [
  { id: 'walk', name: 'Walk', color: '#82E6BC' },
  { id: 'read', name: 'Read', color: '#BDA5FF', unit: 'minutes' },
];
let counter = 0;
const initial = () => ({
  version: 1,
  id: `seed-${++counter}`,
  sequence: 1,
  recordedAt: '2026-10-04T05:00:00.000Z',
  timeZone: 'Australia/Melbourne',
  utcOffsetMinutes: 660,
  type: 'initialize',
  habits,
});
const entry = (before, after, habitId = 'walk', date = '2026-10-04') => ({
  kind: 'entry',
  habitId,
  date,
  before,
  after,
});
const digest = async (text) => createHash('sha256').update(text).digest('hex');
function sqlite(raw, fault = () => {}) {
  const port = {
    async execAsync(sql) {
      fault(sql);
      raw.exec(sql);
    },
    async runAsync(sql, ...params) {
      fault(sql);
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
        await task(port);
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return port;
}
async function fixture(t, fault, seed = initial) {
  const raw = new DatabaseSync(':memory:');
  t.after(() => raw.close());
  let clock = Date.parse('2026-10-04T05:30:00.000Z');
  let zone = 'Australia/Melbourne',
    offset = 660;
  const metadata = (sequence) => ({
    version: 2,
    id: `edit-${++counter}`,
    sequence,
    recordedAt: new Date(clock).toISOString(),
    timeZone: zone,
    utcOffsetMinutes: offset,
  });
  const repository = sqliteRepository(sqlite(raw, fault), seed);
  const store = new ChangeStore(repository, metadata);
  await store.load();
  return {
    raw,
    store,
    repository,
    metadata,
    advance: (ms) => {
      clock += ms;
    },
    setClock: (value) => {
      clock = Date.parse(value);
    },
    setZone: (name, value) => {
      zone = name;
      offset = value;
    },
  };
}

test('rapid repeated checks collapse to one active action; a cancelled group disappears and can resume', async (t) => {
  const { store, repository } = await fixture(t);
  store.change(entry(null, 1));
  const id = store.getSnapshot().replay.undo[0].id;
  store.change(entry(1, null));
  assert.equal(store.getSnapshot().replay.undo.length, 0);
  assert.equal(store.undo(), false);
  store.change(entry(null, 1));
  const action = store.getSnapshot().replay.undo[0];
  assert.equal(action.id, id);
  assert.equal(action.editCount, 3);
  assert.deepEqual(action.change, entry(null, 1));
  assert.equal(store.getSnapshot().events.length, 4);
  store.undo();
  await store.flush();
  assert.equal(store.getSnapshot().replay.undo.length, 0);
  assert.equal(Object.keys(store.getSnapshot().replay.state.values).length, 0);
  store.redo();
  await store.flush();
  assert.equal(store.getSnapshot().replay.undo[0].id, id);
  assert.equal(store.getSnapshot().replay.undo[0].editCount, 3);
  assert.deepEqual(
    (await repository.load()).replay,
    store.getSnapshot().replay,
  );
});

test('numeric 20 → 25 → 30 is one correction and one atomic undo restores 20', async (t) => {
  const { store, advance, raw } = await fixture(t);
  store.change(entry(null, 20, 'read'));
  advance(120000);
  store.change(entry(20, 25, 'read'));
  advance(1000);
  store.change(entry(25, 30, 'read'));
  assert.equal(store.getSnapshot().replay.undo.length, 2);
  assert.deepEqual(
    store.getSnapshot().replay.undo.at(-1).change,
    entry(20, 30, 'read'),
  );
  const beforeLength = store.getSnapshot().events.length;
  store.undo();
  await store.flush();
  assert.equal(store.getSnapshot().events.length, beforeLength + 1);
  assert.equal(store.getSnapshot().replay.state.values['read:2026-10-04'], 20);
  assert.equal(
    raw.prepare('SELECT COUNT(*) AS count FROM changes').get().count,
    5,
  );
  store.redo();
  await store.flush();
  assert.equal(store.getSnapshot().replay.state.values['read:2026-10-04'], 30);
});

test('two-minute inactivity is measured from the latest edit and survives reopening', async (t) => {
  const { store, metadata, repository, advance } = await fixture(t);
  store.change(entry(null, 10, 'read'));
  advance(119999);
  store.change(entry(10, 20, 'read'));
  await store.flush();
  const reopened = new ChangeStore(repository, metadata);
  await reopened.load();
  advance(119999);
  reopened.change(entry(20, 30, 'read'));
  assert.equal(reopened.getSnapshot().replay.undo.length, 1);
  assert.equal(reopened.getSnapshot().replay.undo[0].editCount, 3);
  advance(120000);
  reopened.change(entry(30, 40, 'read'));
  assert.equal(reopened.getSnapshot().replay.undo.length, 2);
  await reopened.flush();
});

test('different habits, effective dates and action kinds form distinct consecutive actions', async (t) => {
  const { store } = await fixture(t);
  store.change(entry(null, 1));
  store.change(entry(null, 1, 'walk', '2026-10-03'));
  store.change(entry(null, 10, 'read'));
  store.change({
    kind: 'colour',
    habitId: 'read',
    before: '#BDA5FF',
    after: '#FFFFFF',
  });
  store.change(entry(10, 20, 'read'));
  assert.equal(store.getSnapshot().replay.undo.length, 5);
  await store.flush();
});

test('midnight, timezone/offset changes and a backwards clock close the group', async (t) => {
  const { store, setClock, setZone } = await fixture(t);
  setClock('2026-10-04T12:59:59.000Z');
  store.change(entry(null, 1));
  setClock('2026-10-04T13:00:00.000Z');
  store.change(entry(1, null));
  assert.equal(store.getSnapshot().replay.undo.length, 2);
  setClock('2026-10-04T12:59:59.000Z');
  store.change(entry(null, 1));
  assert.equal(store.getSnapshot().replay.undo.length, 3);
  setZone('UTC', 0);
  store.change(entry(1, null));
  assert.equal(store.getSnapshot().replay.undo.length, 4);
  await store.flush();
});

test('preferences save without affecting active history, redo, or the entry group', async (t) => {
  const { store, metadata, repository } = await fixture(t);
  store.change(entry(null, 1));
  store.change({ kind: 'haptics', before: true, after: false });
  store.change(entry(1, null));
  assert.equal(store.getSnapshot().replay.undo.length, 0);
  assert.equal(store.getSnapshot().events[2].type, 'preference');
  store.change(entry(null, 1));
  store.undo();
  store.change({ kind: 'haptics', before: false, after: true });
  assert.equal(store.getSnapshot().replay.redo.length, 1);
  store.redo();
  await store.flush();
  const reopened = new ChangeStore(repository, metadata);
  await reopened.load();
  assert.equal(reopened.getSnapshot().replay.state.hapticsEnabled, true);
  reopened.undo();
  await reopened.flush();
  assert.equal(reopened.getSnapshot().replay.state.hapticsEnabled, true);
  assert.equal(reopened.getSnapshot().replay.undo.length, 0);
});

test('undo/redo close the group and a fresh edit discards the visible redo branch', async (t) => {
  const { store } = await fixture(t);
  store.change(entry(null, 10, 'read'));
  store.undo();
  store.redo();
  store.change(entry(10, 20, 'read'));
  assert.equal(store.getSnapshot().replay.undo.length, 2);
  store.undo();
  store.change(entry(10, 15, 'read'));
  assert.equal(store.redo(), false);
  assert.deepEqual(
    store.getSnapshot().replay.undo.at(-1).change,
    entry(10, 15, 'read'),
  );
  await store.flush();
});

test('a colour group cancels cleanly and undo restores the original swatch', async (t) => {
  const { store } = await fixture(t);
  store.change({
    kind: 'colour',
    habitId: 'walk',
    before: '#82E6BC',
    after: '#FFFFFF',
  });
  store.change({
    kind: 'colour',
    habitId: 'walk',
    before: '#FFFFFF',
    after: '#82E6BC',
  });
  assert.equal(store.getSnapshot().replay.undo.length, 0);
  store.change({
    kind: 'colour',
    habitId: 'walk',
    before: '#82E6BC',
    after: '#84C9FF',
  });
  store.undo();
  await store.flush();
  assert.equal(store.getSnapshot().replay.state.habits[0].color, '#82E6BC');
});

test('failure during a grouped undo rolls back atomically and retry retains its original target', async (t) => {
  let fail = false;
  const { store, raw } = await fixture(t, (sql) => {
    if (fail && sql.startsWith('INSERT INTO current_state')) {
      fail = false;
      throw new Error('Interrupted');
    }
  });
  store.change(entry(null, 20, 'read'));
  store.change(entry(20, 30, 'read'));
  await store.flush();
  fail = true;
  store.undo();
  await assert.rejects(store.flush());
  assert.equal(store.getSnapshot().replay.undo.length, 0);
  const projection = JSON.parse(
    raw.prepare('SELECT state_json FROM current_state').get().state_json,
  );
  assert.equal(projection.values['read:2026-10-04'], 30);
  await store.retry();
  await store.flush();
  assert.equal(
    JSON.parse(
      raw.prepare('SELECT state_json FROM current_state').get().state_json,
    ).values['read:2026-10-04'],
    undefined,
  );
});

test('current backup round-trip preserves raw edits, cancelled groups, active history and redo', async (t) => {
  const { store, metadata, repository } = await fixture(t);
  store.change(entry(null, 1));
  store.change(entry(1, null));
  store.change(entry(null, 20, 'read'));
  store.change(entry(20, 30, 'read'));
  store.undo();
  store.change({ kind: 'haptics', before: true, after: false });
  await store.flush();
  const text = await encodeArchive(
    store.getSnapshot().events,
    '2026-10-04T06:00:00.000Z',
    digest,
  );
  assert.equal(JSON.parse(text).version, 23);
  const decoded = await decodeArchive(text, digest);
  assert.deepEqual(decoded.replay, store.getSnapshot().replay);
  await store.exclusive(() => store.replace(decoded.events));
  const reopened = new ChangeStore(repository, metadata);
  await reopened.load();
  assert.equal(reopened.redo(), true);
  await reopened.flush();
  assert.equal(
    reopened.getSnapshot().replay.state.values['read:2026-10-04'],
    30,
  );
  assert.equal(reopened.getSnapshot().replay.undo.length, 1);
  assert.equal(reopened.getSnapshot().replay.state.hapticsEnabled, false);
});

test('existing v1 settings and undo/redo replay unchanged, but current undo skips settings', async (t) => {
  const { repository, store } = await fixture(t);
  const meta = (sequence) => ({
    ...initial(),
    type: undefined,
    habits: undefined,
    version: 1,
    id: `old-${sequence}`,
    sequence,
  });
  const make = (sequence, type, change, targetId) => {
    const { habits: _h, type: _t, ...base } = meta(sequence);
    return { ...base, type, change, ...(targetId ? { targetId } : {}) };
  };
  const events = [
    initial(),
    make(2, 'change', entry(null, 1)),
    make(3, 'change', { kind: 'haptics', before: true, after: false }),
    make(4, 'undo', { kind: 'haptics', before: false, after: true }, 'old-3'),
    make(5, 'redo', { kind: 'haptics', before: true, after: false }, 'old-4'),
    make(6, 'undo', { kind: 'haptics', before: false, after: true }, 'old-5'),
    make(7, 'undo', entry(1, null), 'old-2'),
    make(8, 'redo', entry(null, 1), 'old-7'),
  ];
  await store.exclusive(() => store.replace(events));
  const loaded = await repository.load();
  assert.equal(loaded.replay.undo.length, 1);
  assert.equal(loaded.replay.undo[0].id, 'old-8');
  store.change({ kind: 'haptics', before: true, after: false });
  store.undo();
  await store.flush();
  assert.equal(
    store.getSnapshot().replay.state.values['walk:2026-10-04'],
    undefined,
  );
  assert.equal(store.getSnapshot().replay.state.hapticsEnabled, false);
  assert.equal(store.getSnapshot().events[0].version, 1);
});

test('malformed v2 groups, inverses and preference actions are rejected before saving', async (t) => {
  const { store, advance } = await fixture(t);
  store.change(entry(null, 20, 'read'));
  const snapshot = store.getSnapshot();
  const source = snapshot.events.at(-1);
  const meta = { ...source, id: 'bad', sequence: 3 };
  assert.throws(() =>
    applyEvent(snapshot.replay, {
      ...meta,
      type: 'change',
      groupId: 'missing',
      change: entry(20, 30, 'read'),
    }),
  );
  assert.throws(() =>
    applyEvent(snapshot.replay, {
      ...meta,
      type: 'change',
      groupId: source.groupId,
      change: entry(null, 1),
    }),
  );
  assert.throws(() =>
    applyEvent(snapshot.replay, {
      ...meta,
      type: 'change',
      change: { kind: 'haptics', before: true, after: false },
    }),
  );
  const { groupId: _g, ...control } = meta;
  assert.throws(() =>
    applyEvent(snapshot.replay, {
      ...control,
      type: 'undo',
      targetId: source.id,
      change: entry(20, 5, 'read'),
    }),
  );
  advance(120000);
  assert.throws(() =>
    applyEvent(snapshot.replay, {
      ...meta,
      recordedAt: '2026-10-04T05:32:00.000Z',
      type: 'change',
      groupId: source.groupId,
      change: entry(20, 30, 'read'),
    }),
  );
  await store.flush();
});

test('legacy preference edits retain their historical abandoned redo branch', () => {
  const seed = initial();
  const meta = (sequence) => ({
    version: 1,
    id: `legacy-branch-${sequence}`,
    sequence,
    recordedAt: seed.recordedAt,
    timeZone: seed.timeZone,
    utcOffsetMinutes: seed.utcOffsetMinutes,
  });
  const { replay } = replayEvents([
    seed,
    { ...meta(2), type: 'change', change: entry(null, 1) },
    {
      ...meta(3),
      type: 'undo',
      targetId: 'legacy-branch-2',
      change: entry(1, null),
    },
    {
      ...meta(4),
      type: 'change',
      change: { kind: 'haptics', before: true, after: false },
    },
  ]);
  assert.equal(replay.redo.length, 0);
  assert.equal(replay.undo.length, 0);
  assert.equal(replay.state.hapticsEnabled, false);
});

test('the documented v2 fixture retains grouped actions, preferences and cancelled raw edits', async () => {
  const { events, replay } = await decodeArchive(
    readFileSync(
      new URL('../docs/examples/storage-v2.json', import.meta.url),
      'utf8',
    ),
    digest,
  );
  assert.equal(events.length, 9);
  assert.equal(replay.undo.length, 2);
  assert.equal(replay.undo[1].id, 'example-v2-3');
  assert.equal(replay.undo[1].editCount, 2);
  assert.deepEqual(replay.undo[1].change, entry(20, 30, 'read'));
  assert.equal(replay.state.values['read:2026-10-04'], 30);
  assert.equal(replay.state.values['walk:2026-10-05'], undefined);
  assert.equal(replay.state.hapticsEnabled, false);
});

test('a v1 manifest cannot disguise v2 events and future versions stay protected', async (t) => {
  const { store } = await fixture(t);
  store.change(entry(null, 1));
  await store.flush();
  const archive = JSON.parse(
    await encodeArchive(
      store.getSnapshot().events,
      '2026-10-04T06:00:00.000Z',
      digest,
    ),
  );
  archive.version = 1;
  await assert.rejects(decodeArchive(JSON.stringify(archive), digest));
  archive.version = 2;
  await assert.rejects(decodeArchive(JSON.stringify(archive), digest));
  archive.version = 24;
  await assert.rejects(decodeArchive(JSON.stringify(archive), digest));
  assert.throws(() =>
    replayEvents([
      ...store.getSnapshot().events,
      {
        version: 1,
        id: 'legacy-later',
        sequence: 3,
        recordedAt: '2026-10-04T06:00:00.000Z',
        timeZone: 'UTC',
        utcOffsetMinutes: 0,
        type: 'change',
        change: entry(1, null),
      },
    ]),
  );
});

test('habit creation, edit, archive and order survive SQLite reload and undo in sequence', async (t) => {
  const { store, repository, metadata } = await fixture(t);
  const added = {
    id: 'new-number',
    name: 'Practice',
    color: '#84C9FF',
    type: 'number',
  };
  store.change({
    kind: 'habit',
    habitId: added.id,
    index: 2,
    before: null,
    after: added,
  });
  store.change(entry(null, 0, added.id));
  const edited = { ...added, name: 'Practise piano', unit: 'minutes' };
  store.change({
    kind: 'habit',
    habitId: added.id,
    index: 2,
    before: added,
    after: edited,
  });
  store.change({
    kind: 'habit',
    habitId: added.id,
    index: 2,
    before: edited,
    after: { ...edited, archived: true },
  });
  store.change({
    kind: 'order',
    before: ['walk', 'read', added.id],
    after: ['read', 'walk', added.id],
  });
  await store.flush();
  const reopened = new ChangeStore(repository, metadata);
  await reopened.load();
  assert.deepEqual(
    reopened.getSnapshot().replay.state,
    store.getSnapshot().replay.state,
  );
  assert.equal(
    reopened.getSnapshot().replay.state.values[`${added.id}:2026-10-04`],
    0,
  );
  assert.equal(reopened.getSnapshot().replay.undo.length, 5);
  reopened.undo();
  reopened.undo();
  assert.equal(
    reopened.getSnapshot().replay.state.habits[2].archived,
    undefined,
  );
  assert.equal(reopened.getSnapshot().replay.state.habits[2].name, edited.name);
  reopened.undo();
  reopened.undo();
  reopened.undo();
  await reopened.flush();
  assert.deepEqual(reopened.getSnapshot().replay.state.habits, habits);
  assert.deepEqual(reopened.getSnapshot().replay.state.values, {});
  for (let i = 0; i < 5; i++) assert.equal(reopened.redo(), true);
  await reopened.flush();
  assert.deepEqual(
    reopened.getSnapshot().replay.state,
    store.getSnapshot().replay.state,
  );
  const backup = await encodeArchive(
    reopened.getSnapshot().events,
    '2026-10-04T06:00:00.000Z',
    digest,
  );
  assert.deepEqual(
    (await decodeArchive(backup, digest)).replay,
    reopened.getSnapshot().replay,
  );
});

test('management actions stay distinct and close an entry correction group', async (t) => {
  const { store } = await fixture(t);
  store.change(entry(null, 20, 'read'));
  const before = store.getSnapshot().replay.state.habits[1];
  const after = { ...before, name: 'Reading' };
  store.change({ kind: 'habit', habitId: 'read', index: 1, before, after });
  store.change({
    kind: 'habit',
    habitId: 'read',
    index: 1,
    before: after,
    after: before,
  });
  store.change(entry(20, 30, 'read'));
  assert.equal(store.getSnapshot().replay.undo.length, 4);
  store.undo();
  assert.equal(store.getSnapshot().replay.state.values['read:2026-10-04'], 20);
  await store.flush();
});

test('management validates identities, positions, orders, type conversions and legacy version boundaries', async (t) => {
  const { store } = await fixture(t);
  const state = store.getSnapshot().replay.state;
  const change = {
    kind: 'habit',
    habitId: 'read',
    index: 1,
    before: state.habits[1],
    after: { ...state.habits[1], name: 'Reading' },
  };
  const event = {
    ...initial(),
    version: 3,
    id: 'management-bad',
    sequence: 2,
    type: 'change',
    groupId: 'management-bad',
    change,
  };
  delete event.habits;
  const apply = (change) =>
    applyEvent(store.getSnapshot().replay, { ...event, change });
  assert.throws(() => apply({ ...change, index: 0 }));
  assert.throws(() =>
    apply({ ...change, after: { ...change.after, id: 'walk' } }),
  );
  assert.throws(() =>
    apply({ kind: 'order', before: ['walk', 'read'], after: ['walk', 'walk'] }),
  );
  assert.throws(() =>
    apply({ kind: 'order', before: ['walk', 'read'], after: ['walk'] }),
  );
  assert.throws(() =>
    apply({
      kind: 'order',
      before: ['walk', 'read'],
      after: ['walk', 'missing'],
    }),
  );
  assert.throws(() =>
    applyEvent(store.getSnapshot().replay, { ...event, version: 2 }),
  );
  store.change(entry(null, 30, 'read'));
  assert.throws(() =>
    apply({
      ...change,
      after: { id: 'read', name: 'Read', color: '#BDA5FF', type: 'checkbox' },
    }),
  );
  assert.throws(() => apply({ ...change, after: null }));
  assert.deepEqual(state.habits, habits);
  await store.flush();
});

test('v3 empty initialization supports creation, undo and later preferences without reseeding', () => {
  const seed = { ...initial(), version: 3, habits: [] };
  const habit = {
    id: 'first',
    name: 'Walk',
    color: '#82E6BC',
    type: 'checkbox',
  };
  const meta = (sequence) => ({ ...seed, id: `empty-${sequence}`, sequence });
  const make = (sequence, fields) => {
    const { habits: _h, type: _t, ...base } = meta(sequence);
    return { ...base, ...fields };
  };
  const { replay } = replayEvents([
    seed,
    make(2, {
      type: 'change',
      groupId: 'empty-2',
      change: {
        kind: 'habit',
        habitId: 'first',
        index: 0,
        before: null,
        after: habit,
      },
    }),
    make(3, {
      type: 'undo',
      targetId: 'empty-2',
      change: {
        kind: 'habit',
        habitId: 'first',
        index: 0,
        before: habit,
        after: null,
      },
    }),
    make(4, {
      type: 'preference',
      change: { kind: 'haptics', before: true, after: false },
    }),
  ]);
  assert.equal(replay.state.habits.length, 0);
  assert.equal(replay.state.hapticsEnabled, false);
  assert.equal(replay.redo.length, 1);
});

test('the documented v3 fixture preserves archived definitions, zero and reordered IDs', async () => {
  const { events, replay } = await decodeArchive(
    readFileSync(
      new URL('../docs/examples/storage-v3.json', import.meta.url),
      'utf8',
    ),
    digest,
  );
  assert.equal(events[0].version, 2);
  assert.equal(events[1].version, 3);
  assert.deepEqual(
    replay.state.habits.map((habit) => habit.id),
    ['read', 'walk', 'practice'],
  );
  assert.equal(replay.state.habits[2].archived, true);
  assert.equal(replay.state.habits[2].unit, 'minutes');
  assert.equal(replay.state.values['practice:2026-10-04'], 0);
  assert.equal(replay.undo.length, 5);
  assert.equal(replay.state.hapticsEnabled, false);
});

for (const packedIcon of ['phosphor:acorn', 'tabler:yoga'])
  test(`v4 ${packedIcon} edits survive SQLite reopen, removal, archive restore, Undo/Redo and backup`, async (t) => {
    const { store, repository, metadata } = await fixture(t);
    store.change(entry(null, 1));
    const original = store.getSnapshot().replay.state.habits[0];
    function edit(after) {
      const before = store.getSnapshot().replay.state.habits[0];
      assert.equal(
        store.change({
          kind: 'habit',
          habitId: before.id,
          index: 0,
          before,
          after,
        }),
        true,
      );
    }
    // Exercise an expanded-catalogue icon; the v4 fixture retains legacy choices.
    const packed = { ...original, icon: packedIcon };
    edit(packed);
    edit({ ...packed, icon: 'emoji:🚶🏽‍♀️' });
    edit(original); // None is absence, not a null/string sentinel.
    assert.equal(store.getSnapshot().replay.undo.length, 4);
    assert.equal(store.undo(), true);
    assert.equal(store.getSnapshot().replay.state.habits[0].icon, 'emoji:🚶🏽‍♀️');
    assert.equal(store.undo(), true);
    assert.equal(store.getSnapshot().replay.state.habits[0].icon, packed.icon);
    await store.flush();
    const reopened = new ChangeStore(repository, metadata);
    await reopened.load();
    assert.equal(
      reopened.getSnapshot().replay.state.habits[0].icon,
      packed.icon,
    );
    assert.equal(reopened.redo(), true);
    assert.equal(
      reopened.getSnapshot().replay.state.habits[0].icon,
      'emoji:🚶🏽‍♀️',
    );
    assert.equal(reopened.undo(), true);
    assert.equal(
      reopened.getSnapshot().replay.state.habits[0].icon,
      packedIcon,
    );
    const before = reopened.getSnapshot().replay.state.habits[0];
    const archived = { ...before, archived: true };
    reopened.change({
      kind: 'habit',
      habitId: before.id,
      index: 0,
      before,
      after: archived,
    });
    reopened.change({
      kind: 'habit',
      habitId: before.id,
      index: 0,
      before: archived,
      after: before,
    });
    await reopened.flush();
    assert.equal(
      reopened.getSnapshot().replay.state.values['walk:2026-10-04'],
      1,
    );
    const backup = await encodeArchive(
      reopened.getSnapshot().events,
      '2026-10-04T06:00:00.000Z',
      digest,
    );
    assert.equal(JSON.parse(backup).version, 23);
    const decoded = await decodeArchive(backup, digest);
    assert.deepEqual(decoded.replay, reopened.getSnapshot().replay);
    assert.equal(decoded.events.at(-1).version, 23);
    const disguised = JSON.parse(backup);
    disguised.version = 3;
    await assert.rejects(decodeArchive(JSON.stringify(disguised), digest));
    const backToOld = {
      ...decoded.events.at(-1),
      id: 'downgrade',
      sequence: decoded.events.length + 1,
      version: 3,
      type: 'preference',
      change: { kind: 'haptics', before: true, after: false },
    };
    delete backToOld.groupId;
    assert.throws(() => applyEvent(decoded.replay, backToOld), /version-4/);
  });

test('icons are validated before persistence and cannot be smuggled into v1/v2/v3 definitions', async (t) => {
  const { store } = await fixture(t);
  const before = store.getSnapshot().replay.state.habits[0];
  for (const icon of [
    null,
    '',
    'emoji:',
    'emoji:abc',
    'emoji:💧📚',
    'phosphor:missing',
    'https://example.com/icon.svg',
    { type: 'emoji', value: '💧' },
  ]) {
    assert.throws(() =>
      store.change({
        kind: 'habit',
        habitId: before.id,
        index: 0,
        before,
        after: { ...before, icon },
      }),
    );
  }
  assert.equal(store.getSnapshot().events.length, 1);
  for (const version of [1, 2, 3]) {
    const seed = {
      ...initial(),
      version,
      habits: [{ ...before, icon: 'emoji:💧' }],
    };
    assert.throws(() => replayEvents([seed]));
  }
  const seed = {
    ...initial(),
    version: 4,
    habits: [{ ...before, icon: 'phosphor:drop' }],
  };
  assert.equal(
    replayEvents([seed]).replay.state.habits[0].icon,
    'phosphor:drop',
  );
});

test('the v4 synthetic backup preserves icons and their Undo/Redo alongside unchanged v3 events', async () => {
  const text = readFileSync(
    new URL('../docs/examples/storage-v4.json', import.meta.url),
    'utf8',
  );
  const decoded = await decodeArchive(text, digest);
  assert.equal(
    decoded.replay.state.habits.find((habit) => habit.id === 'walk').icon,
    'phosphor:person-simple-walk',
  );
  assert.equal(
    decoded.replay.state.habits.find((habit) => habit.id === 'read').icon,
    'emoji:📚',
  );
  const old = JSON.parse(
    readFileSync(
      new URL('../docs/examples/storage-v3.json', import.meta.url),
      'utf8',
    ),
  ).events;
  assert.deepEqual(decoded.events.slice(0, old.length), old);
});

const legacyPresetSeed = () => ({
  ...initial(),
  habits: demoHabits.map(({ icon: _icon, ...habit }) => habit),
});
test('preset icon update appends undoable edits once, preserves the seed/entries, and survives SQLite reopen and backup', async (t) => {
  const { store, repository, metadata } = await fixture(
    t,
    undefined,
    legacyPresetSeed,
  );
  store.change(entry(null, 1));
  const prefix = structuredClone(store.getSnapshot().events);
  assert.equal(applyPresetIcons(store), 12);
  assert.equal(applyPresetIcons(store), 0);
  assert.deepEqual(store.getSnapshot().events.slice(0, prefix.length), prefix);
  assert.equal(store.getSnapshot().replay.state.values['walk:2026-10-04'], 1);
  assert.deepEqual(store.getSnapshot().replay.state.habits, demoHabits);
  await store.flush();
  const reopened = new ChangeStore(repository, metadata);
  await reopened.load();
  assert.equal(applyPresetIcons(reopened), 0);
  assert.equal(reopened.undo(), true);
  assert.equal(
    reopened.getSnapshot().replay.state.habits.at(-1).icon,
    undefined,
  );
  assert.equal(applyPresetIcons(reopened), 0); // Raw history preserves the removal decision.
  await reopened.flush();
  const again = new ChangeStore(repository, metadata);
  await again.load();
  assert.equal(applyPresetIcons(again), 0);
  assert.equal(again.redo(), true);
  const archive = await encodeArchive(
    again.getSnapshot().events,
    '2026-10-04T06:00:00.000Z',
    digest,
  );
  assert.deepEqual(
    (await decodeArchive(archive, digest)).replay.state.habits,
    demoHabits,
  );
  await again.flush();
});
test('preset icon update respects custom icons, previous removals, renamed habits and archive slots', async (t) => {
  const { store } = await fixture(t, undefined, legacyPresetSeed);
  function edit(id, fields) {
    const index = store
      .getSnapshot()
      .replay.state.habits.findIndex((habit) => habit.id === id);
    const before = store.getSnapshot().replay.state.habits[index];
    const after = { ...before, ...fields };
    if (fields.icon === null) delete after.icon;
    assert.equal(
      store.change({ kind: 'habit', habitId: id, index, before, after }),
      true,
    );
  }
  edit('walk', { icon: 'emoji:🚶' });
  edit('read', { icon: 'tabler:book' });
  edit('read', { icon: null });
  edit('water', { name: 'A different habit' });
  edit('tidy', { archived: true });
  const order = store
    .getSnapshot()
    .replay.state.habits.map((habit) => habit.id);
  assert.equal(applyPresetIcons(store), 9);
  const habits = store.getSnapshot().replay.state.habits;
  assert.equal(habits.find((habit) => habit.id === 'walk').icon, 'emoji:🚶');
  assert.equal(habits.find((habit) => habit.id === 'read').icon, undefined);
  assert.equal(habits.find((habit) => habit.id === 'water').icon, undefined);
  assert.equal(
    habits.find((habit) => habit.id === 'tidy').icon,
    'phosphor:broom',
  );
  assert.equal(habits.find((habit) => habit.id === 'tidy').archived, true);
  assert.deepEqual(
    habits.map((habit) => habit.id),
    order,
  );
  await store.flush();
});
test('preset icon update skips unrelated seeds and newly initialized icon presets', async (t) => {
  const unrelated = await fixture(t);
  assert.equal(applyPresetIcons(unrelated.store), 0);
  assert.equal(unrelated.store.getSnapshot().events.length, 1);
  const fresh = await fixture(t, undefined, () => ({
    ...initial(),
    version: 4,
    habits: demoHabits,
  }));
  assert.equal(applyPresetIcons(fresh.store), 0);
  assert.equal(fresh.store.getSnapshot().events.length, 1);
});
test('preset icon save failure retains the serialized queue for retry without duplication', async (t) => {
  let fail = false;
  const { store, repository, metadata } = await fixture(
    t,
    (sql) => {
      if (fail && sql.startsWith('INSERT INTO changes'))
        throw new Error('Disk full');
    },
    legacyPresetSeed,
  );
  fail = true;
  assert.equal(applyPresetIcons(store), 12);
  await assert.rejects(store.flush());
  assert.ok(store.getSnapshot().error);
  assert.equal(store.getSnapshot().pending, 12);
  assert.equal(applyPresetIcons(store), 0);
  fail = false;
  await store.retry();
  await store.flush();
  const reopened = new ChangeStore(repository, metadata);
  await reopened.load();
  assert.equal(reopened.getSnapshot().events.length, 13);
  assert.deepEqual(reopened.getSnapshot().replay.state.habits, demoHabits);
  assert.equal(applyPresetIcons(reopened), 0);
});
