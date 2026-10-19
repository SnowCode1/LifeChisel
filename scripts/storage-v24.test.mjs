// Storage v24 and SQL schema 2 (docs/STORAGE.md, docs/SYNC.md).
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  applyEvent,
  inverse,
  replayEvents,
  validateChange,
} from '../packages/core/src/storage/model.ts';
import { sqliteRepository } from '../packages/core/src/storage/repository.ts';
import { ChangeStore } from '../packages/core/src/storage/store.ts';
import {
  decodeArchive,
  encodeArchive,
} from '../packages/core/src/storage/archive.ts';
import { historyPresentation } from '../packages/core/src/history.ts';

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
let ids = 0;
const meta = (sequence, extra = {}) => ({
  version: 24,
  id: `v24-${++ids}`,
  sequence,
  recordedAt: '2026-10-18T05:00:00.000Z',
  timeZone: 'UTC',
  utcOffsetMinutes: 0,
  device: 'here',
  ...extra,
});
const seed = () => ({ ...meta(1), type: 'initialize', habits: [walk] });
async function open(raw, newId = () => 'here') {
  const repository = sqliteRepository(
    port(raw),
    (device) => ({
      ...seed(),
      device,
    }),
    { newId },
  );
  const store = new ChangeStore(repository, (sequence) => meta(sequence));
  await store.load();
  return { repository, store };
}
const entry = (date, before, after) => ({
  kind: 'entry',
  habitId: 'walk',
  date,
  before,
  after,
});

test('the v24 fixture extends v23 exactly and replays devices, batches and their Undo/Redo', async () => {
  const previous = await decodeArchive(fixture(23), digest);
  const next = await decodeArchive(fixture(24), digest);
  assert.deepEqual(
    next.events.slice(0, previous.events.length),
    previous.events,
  );
  const added = next.events.slice(previous.events.length);
  assert.ok(added.every((event) => event.version === 24 && event.device));
  assert.deepEqual(
    added.map((event) => event.change.kind),
    ['textScale', 'textScale', 'entry', 'batch', 'batch', 'batch'],
  );
  // Without a local device every event is this device's own.
  assert.equal(next.replay.state.textScale, 0.9);
  // On the phone, the browser's text size does not apply.
  const phone = replayEvents(next.events, { localDevice: 'example-phone' });
  assert.equal(phone.replay.state.textScale, 1.25);
  assert.deepEqual(phone.replay.state.values, next.replay.state.values);
  // Choices from before v24 name no device, so they count as every device's
  // own: a third device keeps the older text size, not either device's.
  const other = replayEvents(next.events, { localDevice: 'example-new' });
  assert.equal(other.replay.state.textScale, previous.replay.state.textScale);
  assert.equal(other.replay.state.inheritedPreferences, undefined);
  const encoded = JSON.parse(
    await encodeArchive(next.events, '2026-10-18T04:00:00.000Z', digest),
  );
  assert.equal(encoded.sha256, JSON.parse(fixture(24)).sha256);
  assert.equal(encoded.version, 25);
});

test('v24 events need a device; older events must not carry one', () => {
  const event = { ...seed() };
  replayEvents([event]);
  const { device: _device, ...without } = event;
  assert.throws(() => replayEvents([without]), /Invalid identifier/);
  assert.throws(
    () => replayEvents([{ ...without, version: 23, device: 'here' }]),
    /Device IDs require version 24/,
  );
  // Older events cannot follow a v24 one.
  const { replay } = replayEvents([event]);
  assert.throws(() =>
    applyEvent(replay, {
      ...meta(2),
      version: 23,
      device: undefined,
      type: 'preference',
      change: { kind: 'haptics', before: true, after: false },
    }),
  );
});

test('batches validate strictly, apply as one action and Undo/Redo together', async () => {
  const batch = {
    kind: 'batch',
    label: 'restore',
    changes: [entry('2026-10-01', null, 1), entry('2026-10-02', null, 1)],
  };
  validateChange(batch, 24);
  assert.throws(() => validateChange(batch, 23), /require version 24/);
  for (const bad of [
    { ...batch, label: 'other' },
    { ...batch, changes: [] },
    { ...batch, extra: true },
    { ...batch, changes: [batch] },
    {
      ...batch,
      changes: [{ kind: 'haptics', before: true, after: false }],
    },
  ])
    assert.throws(() => validateChange(bad, 24));
  // A batch is all or nothing: a stale item rejects the whole event.
  const raw = new DatabaseSync(':memory:');
  const { store } = await open(raw);
  assert.ok(store.applyBatch('restore', batch.changes));
  const state = () => store.getSnapshot().replay.state;
  assert.equal(state().values['walk:2026-10-02'], 1);
  const action = store.getSnapshot().replay.undo.at(-1);
  assert.deepEqual(
    historyPresentation(action, state()).title,
    'Restored from a backup',
  );
  assert.equal(
    historyPresentation(action, state()).summary,
    '2 changes · 1 habit',
  );
  assert.ok(store.undo());
  assert.equal(state().values['walk:2026-10-01'], undefined);
  assert.deepEqual(inverse(inverse(batch)), batch);
  assert.ok(store.redo());
  assert.equal(state().values['walk:2026-10-01'], 1);
  await store.flush();
  assert.throws(() =>
    applyEvent(store.getSnapshot().replay, {
      ...meta(store.getSnapshot().events.length + 1),
      type: 'change',
      groupId: 'stale',
      id: 'stale',
      change: {
        kind: 'batch',
        label: 'restore',
        changes: [entry('2026-10-03', null, 1), entry('2026-10-01', null, 1)],
      },
    }),
  );
  const reopened = await open(raw);
  assert.deepEqual(
    reopened.store.getSnapshot().replay,
    store.getSnapshot().replay,
  );
});

test('another device’s preferences: device ones inherit until chosen, haptics never, shared ones always', () => {
  const events = [
    seed(),
    {
      ...meta(2, { device: 'there' }),
      type: 'preference',
      change: { kind: 'gridRowHeight', before: null, after: 44 },
    },
    {
      ...meta(3, { device: 'there' }),
      type: 'preference',
      change: { kind: 'haptics', before: true, after: false },
    },
    {
      ...meta(4, { device: 'there' }),
      type: 'preference',
      change: { kind: 'checkboxStyle', before: 'boxes', after: 'marks' },
    },
  ];
  const here = replayEvents(events, { localDevice: 'here' }).replay.state;
  assert.equal(here.gridRowHeight, 44);
  assert.equal(here.hapticsEnabled, true);
  assert.equal(here.checkboxStyle, 'marks');
  assert.deepEqual(here.inheritedPreferences, ['gridRowHeight']);
  // This device's own choice starts from the inherited value, then sticks.
  const own = [
    ...events,
    {
      ...meta(5),
      type: 'preference',
      change: { kind: 'gridRowHeight', before: 44, after: 'auto' },
    },
    {
      ...meta(6, { device: 'there' }),
      type: 'preference',
      change: { kind: 'gridRowHeight', before: 44, after: 50 },
    },
  ];
  const after = replayEvents(own, { localDevice: 'here' }).replay.state;
  assert.equal(after.gridRowHeight, 'auto');
  assert.equal(after.inheritedPreferences, undefined);
  // The other device sees its own value.
  assert.equal(
    replayEvents(own, { localDevice: 'there' }).replay.state.gridRowHeight,
    50,
  );
});

test('schema 1 databases upgrade in place to schema 2 with a lasting device ID', async () => {
  const raw = new DatabaseSync(':memory:');
  // A schema-1 store as written before v24: the log, the projection, recovery.
  const v1Seed = {
    version: 23,
    id: 'old-seed',
    sequence: 1,
    recordedAt: '2026-10-17T00:00:00.000Z',
    timeZone: 'UTC',
    utcOffsetMinutes: 0,
    type: 'initialize',
    habits: [walk],
  };
  raw.exec(`CREATE TABLE changes (sequence INTEGER PRIMARY KEY CHECK(sequence > 0), id TEXT UNIQUE NOT NULL, event_json TEXT NOT NULL);
CREATE TABLE current_state (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), last_sequence INTEGER NOT NULL, state_json TEXT NOT NULL);
CREATE TABLE recovery_archives (id TEXT PRIMARY KEY, recorded_at TEXT NOT NULL, events_json TEXT NOT NULL);
PRAGMA user_version = 1;`);
  raw
    .prepare('INSERT INTO changes VALUES (1, ?, ?)')
    .run('old-seed', JSON.stringify(v1Seed));
  const first = await open(raw, () => 'upgraded-device');
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 2);
  assert.equal(first.store.getSnapshot().device, 'upgraded-device');
  assert.deepEqual(first.store.getSnapshot().events, [v1Seed]);
  assert.equal(first.store.getSnapshot().sync, null);
  first.store.change(entry('2026-10-18', null, 1));
  await first.store.flush();
  assert.equal(first.store.getSnapshot().events[1].device, 'upgraded-device');
  // The ID lasts across reopening; it is never generated twice.
  const second = await open(raw, () => {
    throw new Error('no new device');
  });
  assert.equal(second.store.getSnapshot().device, 'upgraded-device');
  assert.equal(second.store.getSnapshot().events.length, 2);
});

test('log rewrites keep confirmed events, absorb queued edits and save sync state atomically', async () => {
  const raw = new DatabaseSync(':memory:');
  const { store, repository } = await open(raw);
  store.change(entry('2026-10-01', null, 1));
  await store.flush();
  await store.saveSync({
    account: 'a',
    server: 's',
    epoch: 'e1',
    confirmed: 2,
  });
  // Queued local edits, then a rewrite that keeps two events and puts a
  // remote one before the (renumbered) local edits. An edit queued before
  // the rewrite runs is part of what it sees.
  store.change(entry('2026-10-02', null, 1));
  const remote = {
    ...meta(3, { device: 'there', id: 'remote-1' }),
    // Pulled from a device on the current writer, after this one's edits.
    version: 25,
    type: 'change',
    groupId: 'remote-1',
    change: entry('2026-10-05', null, 1),
  };
  let seen = 0;
  const done = store.rewriteLog((snapshot) => {
    const local = snapshot.events.slice(2);
    seen = local.length;
    return {
      keep: 2,
      events: [
        ...snapshot.events.slice(0, 2),
        remote,
        ...local.map((event, index) => ({ ...event, sequence: 4 + index })),
      ],
      archive: null,
      sync: { ...snapshot.sync, confirmed: 3 },
      addConflicts: [
        { id: 'c1', createdAt: '2026-10-18T00:00:00.000Z', kind: 'entry' },
      ],
      removeConflicts: [],
    };
  });
  store.change(entry('2026-10-03', null, 1));
  await done;
  assert.equal(seen, 2);
  // An edit after the rewrite lands after it.
  store.change(entry('2026-10-04', null, 1));
  await store.flush();
  const snapshot = store.getSnapshot();
  assert.deepEqual(
    snapshot.events.map((event) => event.sequence),
    [1, 2, 3, 4, 5, 6],
  );
  assert.equal(snapshot.events[2].id, 'remote-1');
  assert.equal(snapshot.sync.confirmed, 3);
  assert.deepEqual(
    snapshot.conflicts.map((c) => c.id),
    ['c1'],
  );
  const reopened = await open(raw);
  assert.deepEqual(reopened.store.getSnapshot().events, snapshot.events);
  assert.deepEqual(reopened.store.getSnapshot().sync, snapshot.sync);
  assert.deepEqual(
    reopened.store.getSnapshot().conflicts.map((c) => c.id),
    ['c1'],
  );
  await reopened.store.removeConflicts(['c1']);
  assert.equal((await repository.load()).conflicts.length, 0);
  // A rewrite whose kept part no longer matches changes nothing.
  await assert.rejects(
    repository.rewrite({
      keep: 2,
      events: [{ ...snapshot.events[1], sequence: 1 }, snapshot.events[0]],
      state: snapshot.replay.state,
      archive: null,
      sync: null,
      addConflicts: [],
      removeConflicts: [],
    }),
  );
  assert.equal((await repository.load()).events.length, 6);
  // A failed plan leaves the store editable and unchanged.
  await assert.rejects(
    store.rewriteLog(() => {
      throw new Error('bad plan');
    }),
    /bad plan/,
  );
  assert.equal(store.canEdit(), true);
  assert.equal(store.getSnapshot().events.length, 6);
});
