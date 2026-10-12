import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  replayEvents,
  applyEvent,
  inverse,
  validDate,
} from '../src/storage/model.ts';
import { sqliteRepository } from '../src/storage/repository.ts';
import { ChangeStore } from '../src/storage/store.ts';
import { encodeArchive, decodeArchive } from '../src/storage/archive.ts';

const habits = [
  { id: 'walk', name: 'Walk', color: '#82E6BC' },
  { id: 'read', name: 'Read', color: '#BDA5FF', unit: 'minutes' },
];
let counter = 0;
const metadata = (sequence) => ({
  version: 1,
  id: `event-${++counter}`,
  sequence,
  recordedAt: '2026-10-04T05:30:00.000Z',
  timeZone: 'Australia/Melbourne',
  utcOffsetMinutes: 660,
});
const initialize = () => ({ ...metadata(1), type: 'initialize', habits });
const entry = (before, after, habitId = 'walk', date = '2026-10-04') => ({
  kind: 'entry',
  habitId,
  date,
  before,
  after,
});
const digest = async (text) => createHash('sha256').update(text).digest('hex');
const change = (sequence, value) => ({
  ...metadata(sequence),
  type: 'change',
  change: value,
});

function port(raw, fault = () => {}) {
  const db = {
    async execAsync(sql) {
      fault(sql);
      raw.exec(sql);
    },
    async runAsync(sql, ...params) {
      fault(sql);
      return raw.prepare(sql).run(...params);
    },
    async getFirstAsync(sql, ...params) {
      fault(sql);
      return raw.prepare(sql).get(...params) ?? null;
    },
    async getAllAsync(sql, ...params) {
      fault(sql);
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
async function fixture(t, fault) {
  const raw = new DatabaseSync(':memory:');
  t.after(() => raw.close());
  const repository = sqliteRepository(port(raw, fault), initialize);
  const store = new ChangeStore(repository, metadata);
  await store.load();
  assert.equal(store.getSnapshot().status, 'ready');
  return { raw, repository, store };
}

test('replay keeps explicit numeric zero distinct from unrecorded and preserves corrected-day keys', () => {
  const events = [
    initialize(),
    change(2, entry(null, 0, 'read', '2024-02-29')),
    change(3, entry(0, 30, 'read', '2024-02-29')),
    change(4, entry(30, null, 'read', '2024-02-29')),
  ];
  assert.equal(
    replayEvents(events.slice(0, 2)).replay.state.values['read:2024-02-29'],
    0,
  );
  assert.equal(
    replayEvents(events.slice(0, 3)).replay.state.values['read:2024-02-29'],
    30,
  );
  assert.equal(
    Object.hasOwn(replayEvents(events).replay.state.values, 'read:2024-02-29'),
    false,
  );
  assert.equal(events[1].recordedAt.slice(0, 10), '2026-10-04');
  assert.equal(events[1].change.date, '2024-02-29');
});

test('replay rejects malformed dates, nonfinite totals, unsupported schemas, unknown habits and broken causality', () => {
  const initial = initialize();
  assert.equal(validDate('2025-02-29'), false);
  assert.equal(validDate('2024-02-29'), true);
  for (const value of [
    entry(null, 1, 'missing'),
    entry(1, null),
    entry(null, 2),
    entry(null, Infinity, 'read'),
    entry(null, -1, 'read'),
    entry(null, Number.MAX_SAFE_INTEGER + 1, 'read'),
    entry(null, 1, 'walk', '2025-02-29'),
  ]) {
    assert.throws(() => replayEvents([initial, change(2, value)]));
  }
  assert.throws(() => replayEvents([{ ...initial, version: 99 }]));
  assert.throws(() => replayEvents([{ ...initial, unwanted: true }]));
  assert.throws(() =>
    replayEvents([{ ...initial, habits: [...habits, habits[0]] }]),
  );
  assert.throws(() => replayEvents([initial, change(3, entry(null, 1))]));
  const second = change(2, entry(null, 1));
  assert.throws(() =>
    replayEvents([
      initial,
      second,
      { ...change(3, entry(1, null)), id: second.id },
    ]),
  );
});

test('undo and redo append inverse changes, survive replay and clear redo after a new edit', async (t) => {
  const { store } = await fixture(t);
  store.change(entry(null, 1));
  store.change(entry(null, 0, 'read'));
  assert.equal(store.undo(), true);
  assert.equal(
    Object.hasOwn(store.getSnapshot().replay.state.values, 'read:2026-10-04'),
    false,
  );
  assert.equal(store.redo(), true);
  assert.equal(store.getSnapshot().replay.state.values['read:2026-10-04'], 0);
  store.undo();
  store.change({
    kind: 'colour',
    habitId: 'walk',
    before: '#82E6BC',
    after: '#FFFFFF',
  });
  assert.equal(store.redo(), false);
  store.undo();
  store.undo();
  await store.flush();
  const snapshot = store.getSnapshot();
  assert.equal(snapshot.replay.state.habits[0].color, '#82E6BC');
  assert.equal(Object.keys(snapshot.replay.state.values).length, 0);
  assert.deepEqual(replayEvents(snapshot.events).replay, snapshot.replay);
  assert.equal(snapshot.events.length, 9);
});

test('undo cannot target an older edit or fabricate a different inverse', () => {
  const first = initialize();
  const second = change(2, entry(null, 1));
  const third = change(3, entry(null, 20, 'read'));
  const before = replayEvents([first, second, third]).replay;
  assert.throws(() =>
    applyEvent(before, {
      ...metadata(4),
      type: 'undo',
      targetId: second.id,
      change: inverse(second.change),
    }),
  );
  assert.throws(() =>
    applyEvent(before, {
      ...metadata(4),
      type: 'undo',
      targetId: third.id,
      change: entry(20, 3, 'read'),
    }),
  );
});

test('rapid same-cell edits serialize without stale toggles or lost events', async (t) => {
  const { store, repository } = await fixture(t);
  for (let i = 0; i < 101; i++) {
    const before =
      store.getSnapshot().replay.state.values['walk:2026-10-04'] ?? null;
    assert.equal(store.change(entry(before, before === 1 ? null : 1)), true);
  }
  assert.equal(store.getSnapshot().replay.state.values['walk:2026-10-04'], 1);
  await store.flush();
  const loaded = await repository.load();
  assert.equal(loaded.events.length, 102);
  assert.deepEqual(loaded.replay, store.getSnapshot().replay);
});

test('reopen a disk database preserves entries, colours, preferences and undo without reseeding', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'onpurpose-store-'));
  const path = join(directory, 'test.db');
  let raw = new DatabaseSync(path);
  try {
    let repository = sqliteRepository(port(raw), initialize);
    const store = new ChangeStore(repository, metadata);
    await store.load();
    store.change(entry(null, 12.5, 'read', '2026-10-05'));
    store.change({
      kind: 'colour',
      habitId: 'walk',
      before: '#82E6BC',
      after: '#84C9FF',
    });
    store.change({ kind: 'haptics', before: true, after: false });
    await store.flush();
    const expected = store.getSnapshot();
    raw.close();
    raw = new DatabaseSync(path);
    repository = sqliteRepository(port(raw), () => {
      throw new Error('Must not reseed');
    });
    const reopened = new ChangeStore(repository, metadata);
    await reopened.load();
    assert.deepEqual(reopened.getSnapshot().events, expected.events);
    assert.deepEqual(reopened.getSnapshot().replay, expected.replay);
    assert.equal(reopened.undo(), true);
    await reopened.flush();
    assert.equal(reopened.getSnapshot().replay.state.hapticsEnabled, false);
    assert.equal(
      reopened.getSnapshot().replay.state.habits[0].color,
      '#82E6BC',
    );
  } finally {
    raw.close();
    rmSync(directory, { recursive: true });
  }
});

test('projection-write failure rolls back the event, keeps queued edits and retries in order', async (t) => {
  let fail = false;
  const { store, raw } = await fixture(t, (sql) => {
    if (fail && sql.startsWith('INSERT INTO current_state')) {
      fail = false;
      throw new Error('Disk full');
    }
  });
  fail = true;
  store.change(entry(null, 1));
  store.change(entry(null, 20, 'read'));
  await assert.rejects(store.flush());
  assert.equal(
    raw.prepare('SELECT COUNT(*) AS count FROM changes').get().count,
    1,
  );
  assert.equal(store.getSnapshot().pending, 2);
  assert.match(store.getSnapshot().error, /not saved/);
  assert.equal(store.change(entry(1, null)), false);
  await store.retry();
  await store.flush();
  assert.equal(store.getSnapshot().pending, 0);
  assert.equal(store.getSnapshot().error, null);
  assert.equal(
    raw.prepare('SELECT COUNT(*) AS count FROM changes').get().count,
    3,
  );
});

test('an uncertain successful commit retries idempotently without duplicate history', async (t) => {
  const { repository, raw } = await fixture(t);
  let once = true;
  const wrapped = {
    ...repository,
    async append(event, state) {
      await repository.append(event, state);
      if (once) {
        once = false;
        throw new Error('Lost acknowledgement');
      }
    },
  };
  const store = new ChangeStore(wrapped, metadata);
  await store.load();
  store.change(entry(null, 1));
  await assert.rejects(store.flush());
  await store.retry();
  await store.flush();
  assert.equal(
    raw.prepare('SELECT COUNT(*) AS count FROM changes').get().count,
    2,
  );
  assert.equal(store.getSnapshot().pending, 0);
});

test('derived projection is repaired from the log, while corrupt log data is never reset', async (t) => {
  const { raw, repository } = await fixture(t);
  raw.exec(
    "UPDATE current_state SET state_json = 'broken', last_sequence = 99",
  );
  const repaired = await repository.load();
  assert.equal(repaired.replay.state.habits.length, 2);
  assert.equal(
    raw.prepare('SELECT last_sequence FROM current_state').get().last_sequence,
    1,
  );
  raw.exec("UPDATE changes SET event_json = 'broken'");
  await assert.rejects(repository.load());
  assert.equal(
    raw.prepare('SELECT event_json FROM changes').get().event_json,
    'broken',
  );
});

test('future database versions and partial initialization are refused without data replacement', async (t) => {
  const raw = new DatabaseSync(':memory:');
  t.after(() => raw.close());
  raw.exec(
    "CREATE TABLE private_data (value TEXT); INSERT INTO private_data VALUES ('keep');",
  );
  const repository = sqliteRepository(port(raw), initialize);
  await assert.rejects(repository.load(), /Unrecognized/);
  raw.exec('PRAGMA user_version = 2');
  await assert.rejects(repository.load(), /newer version/);
  assert.equal(
    raw.prepare('SELECT value FROM private_data').get().value,
    'keep',
  );
});

test('initial schema and seed changes roll back together when initialization is interrupted', async (t) => {
  const raw = new DatabaseSync(':memory:');
  t.after(() => raw.close());
  let fail = true;
  const repository = sqliteRepository(
    port(raw, (sql) => {
      if (fail && sql.startsWith('INSERT INTO current_state')) {
        fail = false;
        throw new Error('Interrupted');
      }
    }),
    initialize,
  );
  await assert.rejects(repository.load());
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 0);
  assert.equal(
    raw
      .prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'",
      )
      .get().count,
    0,
  );
  assert.equal((await repository.load()).events.length, 1);
});

test('export round-trip preserves all events, future dates, explicit zero and undo/redo state', async (t) => {
  const { store } = await fixture(t);
  store.change(entry(null, 0, 'read', '2027-01-01'));
  store.change(entry(null, 1));
  store.undo();
  await store.flush();
  const text = await encodeArchive(
    store.getSnapshot().events,
    '2026-10-04T05:35:00.000Z',
    digest,
  );
  const restored = await decodeArchive(text, digest);
  assert.deepEqual(restored.events, store.getSnapshot().events);
  assert.deepEqual(restored.replay, store.getSnapshot().replay);
});

test('import rejects truncated, modified, duplicate, out-of-order and future-format archives', async () => {
  const events = [initialize(), change(2, entry(null, 1))];
  const text = await encodeArchive(events, '2026-10-04T05:35:00.000Z', digest);
  await assert.rejects(decodeArchive(text.slice(0, -10), digest));
  for (const mutation of [
    (raw) => {
      raw.version = 99;
    },
    (raw) => {
      raw.events[1].change.after = 2;
    },
    (raw) => {
      raw.eventCount = 999;
    },
    (raw) => {
      raw.sha256 = '0'.repeat(64);
    },
  ]) {
    const raw = JSON.parse(text);
    mutation(raw);
    await assert.rejects(decodeArchive(JSON.stringify(raw), digest));
  }
  for (const mutation of [
    (raw) => {
      raw.events[1].id = raw.events[0].id;
    },
    (raw) => {
      raw.events[1].sequence = 3;
    },
    (raw) => {
      raw.events[1].change.habitId = 'missing';
    },
    (raw) => {
      raw.events[1].change.date = '2026-02-30';
    },
  ]) {
    const raw = JSON.parse(text);
    mutation(raw);
    raw.sha256 = await digest(JSON.stringify(raw.events));
    await assert.rejects(decodeArchive(JSON.stringify(raw), digest));
  }
});

test('restore is atomic and keeps a recoverable pre-restore log', async (t) => {
  const { store, repository } = await fixture(t);
  store.change(entry(null, 1));
  await store.flush();
  const original = store.getSnapshot().events;
  const replacement = [initialize(), change(2, entry(null, 42, 'read'))];
  await store.exclusive(() => store.replace(replacement));
  assert.equal(store.getSnapshot().replay.state.values['read:2026-10-04'], 42);
  assert.deepEqual(await repository.recoveryEvents(), original);
  await store.exclusive(async () =>
    store.replace(await repository.recoveryEvents()),
  );
  assert.deepEqual(store.getSnapshot().events, original);
  assert.deepEqual(await repository.recoveryEvents(), replacement);
});

test('restore failure rolls back replaced log, projection and recovery archive together', async (t) => {
  let fail = false;
  const { raw, store, repository } = await fixture(t, (sql) => {
    if (fail && sql.startsWith('INSERT INTO changes')) {
      fail = false;
      throw new Error('Restore interrupted');
    }
  });
  store.change(entry(null, 1));
  await store.flush();
  const original = store.getSnapshot().events;
  fail = true;
  await assert.rejects(
    store.exclusive(() =>
      store.replace([initialize(), change(2, entry(null, 10, 'read'))]),
    ),
  );
  assert.deepEqual((await repository.load()).events, original);
  assert.equal(
    raw.prepare('SELECT COUNT(*) AS count FROM recovery_archives').get().count,
    0,
  );
  assert.deepEqual(store.getSnapshot().events, original);
});

test('exclusive backup work blocks edits and waits for all pending writes', async (t) => {
  const { store, repository } = await fixture(t);
  store.change(entry(null, 1));
  await store.exclusive(async () => {
    assert.equal(store.getSnapshot().pending, 0);
    assert.equal(store.change(entry(1, null)), false);
    assert.equal((await repository.load()).events.length, 2);
  });
  assert.equal(store.canEdit(), true);
});

test('failed startup exposes a retry without creating a replacement log', async (t) => {
  const { repository } = await fixture(t);
  let fail = true;
  const store = new ChangeStore(
    {
      ...repository,
      async load() {
        if (fail) throw new Error('Temporarily locked');
        return repository.load();
      },
    },
    metadata,
  );
  await store.load();
  assert.equal(store.getSnapshot().status, 'load-error');
  assert.equal(store.change(entry(null, 1)), false);
  fail = false;
  await store.retry();
  assert.equal(store.getSnapshot().status, 'ready');
  assert.equal(store.getSnapshot().events.length, 1);
});

test('every pre-reload habit edit remains undoable while settings persist independently', async (t) => {
  const { store, repository } = await fixture(t);
  store.change(entry(null, 1, 'walk', '2026-10-03'));
  store.change(entry(null, 0, 'read', '2026-10-05'));
  store.change({
    kind: 'colour',
    habitId: 'walk',
    before: '#82E6BC',
    after: '#FFFFFF',
  });
  store.change({ kind: 'haptics', before: true, after: false });
  await store.flush();
  const expected = store.getSnapshot().replay.state;
  let reopened = new ChangeStore(repository, metadata);
  await reopened.load();
  let count = 0;
  while (reopened.undo()) count++;
  assert.equal(count, 3);
  await reopened.flush();
  assert.deepEqual(reopened.getSnapshot().replay.state, {
    ...replayEvents([store.getSnapshot().events[0]]).replay.state,
    hapticsEnabled: false,
  });
  reopened = new ChangeStore(repository, metadata);
  await reopened.load();
  count = 0;
  while (reopened.redo()) count++;
  assert.equal(count, 3);
  await reopened.flush();
  assert.deepEqual(reopened.getSnapshot().replay.state, expected);
});

test('long-log replay does not mutate source events or repeatedly copy accumulated stacks', () => {
  const initial = initialize();
  Object.freeze(initial.habits);
  Object.freeze(initial);
  const events = [initial];
  for (let i = 0; i < 10000; i++) {
    const event = change(i + 2, entry(i === 0 ? null : i - 1, i, 'read'));
    Object.freeze(event.change);
    Object.freeze(event);
    events.push(event);
  }
  Object.freeze(events);
  const result = replayEvents(events);
  assert.equal(result.replay.state.values['read:2026-10-04'], 9999);
  assert.equal(result.replay.undo.length, 10000);
  assert.equal(initial.habits[0].color, '#82E6BC');
});

test('the documented v1 archive is importable and preserves its backdated and future entries', async () => {
  const { readFileSync } = await import('node:fs');
  const result = await decodeArchive(
    readFileSync(
      new URL('../docs/examples/storage-v1.json', import.meta.url),
      'utf8',
    ),
    digest,
  );
  assert.equal(result.replay.state.values['read:2026-10-03'], 30);
  assert.equal(result.replay.state.values['walk:2026-10-05'], 1);
  assert.equal(result.events.length, 6);
});

test('browser preview persists independently and quota failure leaves its prior document intact', async () => {
  const { browserRepository } =
    await import('../src/storage/browserRepository.ts');
  let text = null;
  let fail = false;
  const storage = {
    getItem() {
      return text;
    },
    setItem(_key, value) {
      if (fail) throw new Error('Quota');
      text = value;
    },
  };
  const repository = browserRepository(storage, initialize);
  const store = new ChangeStore(repository, metadata);
  await store.load();
  store.change(entry(null, 1));
  await store.flush();
  const expected = text;
  fail = true;
  store.change(entry(1, null));
  await assert.rejects(store.flush());
  assert.equal(text, expected);
  fail = false;
  await store.retry();
  await store.flush();
  const reopened = new ChangeStore(
    browserRepository(storage, () => {
      throw new Error('Must not reseed');
    }),
    metadata,
  );
  await reopened.load();
  assert.deepEqual(reopened.getSnapshot().replay, store.getSnapshot().replay);
});

test('v5 start dates and spacing survive SQLite reload, undo/redo and backup round trips', async (t) => {
  const { store, repository } = await fixture(t);
  store.change(entry(null, 1, 'walk', '2024-02-29'));
  const before = store.getSnapshot().replay.state.habits[0];
  const after = { ...before, startDate: '2024-02-29' };
  assert.ok(
    store.change({
      kind: 'habit',
      habitId: before.id,
      index: 0,
      before,
      after,
    }),
  );
  store.undo();
  const beforePreference = store.getSnapshot().replay;
  assert.ok(
    store.change({ kind: 'rowSpacing', before: 'standard', after: 'compact' }),
  );
  assert.deepEqual(store.getSnapshot().replay.undo, beforePreference.undo);
  assert.deepEqual(store.getSnapshot().replay.redo, beforePreference.redo);
  await store.flush();
  const reopened = new ChangeStore(repository, metadata);
  await reopened.load();
  assert.equal(reopened.getSnapshot().replay.state.rowSpacing, 'compact');
  assert.equal(
    reopened.getSnapshot().replay.state.habits[0].startDate,
    undefined,
  );
  assert.ok(reopened.redo());
  await reopened.flush();
  assert.equal(
    reopened.getSnapshot().replay.state.habits[0].startDate,
    '2024-02-29',
  );
  assert.equal(
    reopened.getSnapshot().replay.state.values['walk:2024-02-29'],
    1,
  );
  const text = await encodeArchive(
    reopened.getSnapshot().events,
    '2026-10-04T06:00:00.000Z',
    digest,
  );
  assert.equal(JSON.parse(text).version, 20);
  const decoded = await decodeArchive(text, digest);
  assert.deepEqual(decoded.replay, reopened.getSnapshot().replay);
  const archive = JSON.parse(text);
  archive.version = 4;
  await assert.rejects(
    decodeArchive(JSON.stringify(archive), digest),
    /version/,
  );
  assert.throws(
    () =>
      applyEvent(decoded.replay, {
        ...metadata(decoded.events.length + 1),
        version: 4,
        type: 'preference',
        change: { kind: 'haptics', before: true, after: false },
      }),
    /version-[57]/,
  );
});
test('v5 strictly validates dates, preference values, preconditions and version boundaries', async (t) => {
  const { store } = await fixture(t);
  const before = store.getSnapshot().replay.state.habits[0];
  const initial = initialize();
  for (const startDate of [
    '2025-02-29',
    '2026-04-31',
    '04/10/2026',
    null,
    '',
    '2026-10-04T00:00:00Z',
  ]) {
    assert.throws(() =>
      store.change({
        kind: 'habit',
        habitId: before.id,
        index: 0,
        before,
        after: { ...before, startDate },
      }),
    );
  }
  for (const version of [1, 2, 3, 4]) {
    assert.throws(() =>
      replayEvents([
        {
          ...initial,
          version,
          habits: [{ ...before, startDate: '2026-10-04' }],
        },
      ]),
    );
    assert.throws(() =>
      replayEvents([
        initial,
        {
          ...metadata(2),
          version,
          type: 'preference',
          change: { kind: 'rowSpacing', before: 'standard', after: 'roomy' },
        },
      ]),
    );
  }
  assert.throws(() =>
    store.change({ kind: 'rowSpacing', before: 'standard', after: 'tiny' }),
  );
  assert.throws(
    () =>
      store.change({ kind: 'rowSpacing', before: 'roomy', after: 'compact' }),
    /precondition/,
  );
  const disguised = {
    ...metadata(2),
    version: 5,
    type: 'change',
    groupId: 'disguised',
    change: { kind: 'rowSpacing', before: 'standard', after: 'roomy' },
  };
  assert.throws(() => replayEvents([initial, disguised]), /Preferences/);
  assert.equal(store.getSnapshot().events.length, 1);
  assert.ok(
    store.change({ kind: 'rowSpacing', before: 'standard', after: 'roomy' }),
  );
  assert.ok(
    store.change({ kind: 'rowSpacing', before: 'roomy', after: 'standard' }),
  );
  await store.flush();
  assert.equal(store.getSnapshot().replay.undo.length, 0);
});

test('v1–v4 fixtures upgrade to v5 without rewriting events or losing projected records', async () => {
  const { readFileSync } = await import('node:fs');
  for (const version of [1, 2, 3, 4]) {
    const original = JSON.parse(
      readFileSync(
        new URL(`../docs/examples/storage-v${version}.json`, import.meta.url),
        'utf8',
      ),
    );
    const { replay, events } = await decodeArchive(
      JSON.stringify(original),
      digest,
    );
    const preference = {
      ...metadata(events.length + 1),
      version: 5,
      type: 'preference',
      change: { kind: 'rowSpacing', before: 'standard', after: 'roomy' },
    };
    const updated = applyEvent(replay, preference);
    assert.deepEqual(updated.state, { ...replay.state, rowSpacing: 'roomy' });
    assert.deepEqual(updated.undo, replay.undo);
    assert.deepEqual(updated.redo, replay.redo);
    const decoded = await decodeArchive(
      await encodeArchive(
        [...events, preference],
        '2026-10-04T07:00:00.000Z',
        digest,
      ),
      digest,
    );
    assert.deepEqual(decoded.events.slice(0, -1), original.events);
    assert.deepEqual(decoded.replay.state, updated.state);
  }
});
test('documented v5 backup keeps the v4 prefix and date Undo/Redo across a preference change', async () => {
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(
    new URL('../docs/examples/storage-v5.json', import.meta.url),
    'utf8',
  );
  const legacy = JSON.parse(
    readFileSync(
      new URL('../docs/examples/storage-v4.json', import.meta.url),
      'utf8',
    ),
  );
  const { events, replay } = await decodeArchive(text, digest);
  assert.deepEqual(events.slice(0, legacy.events.length), legacy.events);
  assert.equal(replay.state.rowSpacing, 'compact');
  assert.equal(replay.state.habits[0].startDate, '2026-09-01');
  assert.equal(replay.undo.at(-1).id, 'v5-start');
  assert.equal(replay.redo.length, 0);
});

test('v6 display settings persist through SQLite, preserve Redo and round-trip with backups', async (t) => {
  const { store, repository } = await fixture(t);
  store.change(entry(null, 1));
  store.undo();
  const original = store.getSnapshot().replay;
  for (const change of [
    { kind: 'columnSpacing', before: 'compact', after: 'roomy' },
    { kind: 'weekStart', before: 'monday', after: 'sunday' },
    { kind: 'dateFading', before: true, after: false },
  ])
    assert.ok(store.change(change));
  assert.deepEqual(store.getSnapshot().replay.undo, original.undo);
  assert.deepEqual(store.getSnapshot().replay.redo, original.redo);
  await store.flush();
  const reopened = new ChangeStore(repository, metadata);
  await reopened.load();
  assert.deepEqual(reopened.getSnapshot().replay.state, {
    ...original.state,
    columnSpacing: 'roomy',
    weekStart: 'sunday',
    dateFading: false,
  });
  assert.ok(reopened.redo());
  await reopened.flush();
  const archive = await encodeArchive(
    reopened.getSnapshot().events,
    '2026-10-04T08:00:00.000Z',
    digest,
  );
  assert.equal(JSON.parse(archive).version, 20);
  const decoded = await decodeArchive(archive, digest);
  assert.deepEqual(decoded.replay, reopened.getSnapshot().replay);
  assert.equal(decoded.replay.state.values['walk:2026-10-04'], 1);
  const disguised = JSON.parse(archive);
  disguised.version = 5;
  await assert.rejects(
    decodeArchive(JSON.stringify(disguised), digest),
    /version/,
  );
  assert.throws(
    () =>
      applyEvent(decoded.replay, {
        ...metadata(decoded.events.length + 1),
        version: 5,
        type: 'preference',
        change: { kind: 'haptics', before: true, after: false },
      }),
    /version-[67]/,
  );
});
test('v6 preferences preserve correction grouping and restore default values', async (t) => {
  const { store } = await fixture(t);
  store.change(entry(null, 1));
  const group = store.getSnapshot().replay.lastGroup;
  const choices = [
    { kind: 'columnSpacing', before: 'compact', after: 'standard' },
    { kind: 'weekStart', before: 'monday', after: 'sunday' },
    { kind: 'dateFading', before: true, after: false },
  ];
  for (const change of choices) store.change(change);
  assert.deepEqual(store.getSnapshot().replay.lastGroup, group);
  store.change(entry(1, null));
  assert.equal(store.getSnapshot().replay.undo.length, 0);
  for (const change of choices) store.change(inverse(change));
  await store.flush();
  const state = store.getSnapshot().replay.state;
  assert.equal(state.columnSpacing, 'compact');
  assert.equal(state.weekStart, 'monday');
  assert.equal(state.dateFading, true);
  assert.equal(store.getSnapshot().replay.undo.length, 0);
});
test('v6 preferences reject invalid values, old event versions and habit-action disguises', async (t) => {
  const { store } = await fixture(t);
  const cases = [
    { kind: 'columnSpacing', before: 'compact', after: 'roomy' },
    { kind: 'weekStart', before: 'monday', after: 'sunday' },
    { kind: 'dateFading', before: true, after: false },
  ];
  for (const change of cases) {
    for (const version of [1, 2, 3, 4, 5])
      assert.throws(() =>
        replayEvents([
          initialize(),
          { ...metadata(2), version, type: 'preference', change },
        ]),
      );
    for (const invalid of [null, 0, {}, 'unknown'])
      assert.throws(() => store.change({ ...change, after: invalid }));
    assert.throws(() => store.change(inverse(change)), /precondition/);
    assert.throws(
      () =>
        replayEvents([
          initialize(),
          {
            ...metadata(2),
            version: 6,
            type: 'change',
            groupId: 'disguised',
            change,
          },
        ]),
      /Preferences/,
    );
  }
  assert.equal(store.getSnapshot().events.length, 1);
});
test('v1–v5 fixtures accept v6 preferences while retaining every original record', async () => {
  const { readFileSync } = await import('node:fs');
  for (const version of [1, 2, 3, 4, 5]) {
    const text = readFileSync(
      new URL(`../docs/examples/storage-v${version}.json`, import.meta.url),
      'utf8',
    );
    const { events, replay } = await decodeArchive(text, digest);
    const change = { kind: 'weekStart', before: 'monday', after: 'sunday' };
    const updated = [
      ...events,
      {
        ...metadata(events.length + 1),
        version: 6,
        type: 'preference',
        change,
      },
    ];
    const decoded = await decodeArchive(
      await encodeArchive(updated, '2026-10-04T08:00:00.000Z', digest),
      digest,
    );
    assert.deepEqual(decoded.events.slice(0, -1), events);
    assert.deepEqual(decoded.replay.state, {
      ...replay.state,
      weekStart: 'sunday',
    });
    assert.deepEqual(decoded.replay.undo, replay.undo);
    assert.deepEqual(decoded.replay.redo, replay.redo);
  }
});

test('documented v6 backup restores display choices and a habit redo across preferences', async () => {
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(
    new URL('../docs/examples/storage-v6.json', import.meta.url),
    'utf8',
  );
  const { replay } = await decodeArchive(text, digest);
  assert.equal(replay.state.columnSpacing, 'roomy');
  assert.equal(replay.state.weekStart, 'sunday');
  assert.equal(replay.state.dateFading, false);
  assert.equal(replay.state.values['walk:2026-10-04'], 1);
  assert.equal(replay.undo.length, 1);
  assert.equal(replay.undo[0].id, 'v6-check');
});

test('v7 descriptions survive native reload, Undo/Redo, archive/restore, clear and a full backup', async (t) => {
  const { store, repository } = await fixture(t);
  store.change(entry(null, 1));
  const before = store.getSnapshot().replay.state.habits[0];
  const description =
    '**My reason**\n\n- A small start\n\n[My notes](obsidian://open?vault=Personal)';
  const withNote = { ...before, description };
  store.change({
    kind: 'habit',
    habitId: before.id,
    index: 0,
    before,
    after: withNote,
  });
  await store.flush();
  const reopened = new ChangeStore(repository, metadata);
  await reopened.load();
  assert.equal(
    reopened.getSnapshot().replay.state.habits[0].description,
    description,
  );
  assert.ok(reopened.undo());
  await reopened.flush();
  assert.equal(
    reopened.getSnapshot().replay.state.habits[0].description,
    undefined,
  );
  assert.ok(reopened.redo());
  await reopened.flush();
  const archived = { ...withNote, archived: true };
  reopened.change({
    kind: 'habit',
    habitId: before.id,
    index: 0,
    before: withNote,
    after: archived,
  });
  reopened.undo();
  reopened.redo();
  reopened.change({
    kind: 'habit',
    habitId: before.id,
    index: 0,
    before: archived,
    after: { ...archived, archived: false },
  });
  await reopened.flush();
  const restoredHabit = reopened.getSnapshot().replay.state.habits[0];
  assert.equal(restoredHabit.description, description);
  assert.equal(
    reopened.getSnapshot().replay.state.values['walk:2026-10-04'],
    1,
  );
  reopened.undo();
  reopened.redo(); // close correction group
  const { description: _description, ...cleared } = restoredHabit;
  reopened.change({
    kind: 'habit',
    habitId: before.id,
    index: 0,
    before: restoredHabit,
    after: cleared,
  });
  await reopened.flush();
  const again = new ChangeStore(repository, metadata);
  await again.load();
  assert.equal(
    again.getSnapshot().replay.state.habits[0].description,
    undefined,
  );
  assert.ok(again.undo());
  await again.flush();
  assert.equal(
    again.getSnapshot().replay.state.habits[0].description,
    description,
  );
  const decoded = await decodeArchive(
    await encodeArchive(
      again.getSnapshot().events,
      '2026-10-05T02:00:00.000Z',
      digest,
    ),
    digest,
  );
  assert.deepEqual(decoded.replay, again.getSnapshot().replay);
  assert.deepEqual(decoded.events, again.getSnapshot().events);
});
test('failed description save rolls back event and projection together, then retries without losing the note', async (t) => {
  let fail = false;
  const { store, repository, raw } = await fixture(t, (sql) => {
    if (fail && sql.startsWith('INSERT INTO current_state')) {
      fail = false;
      throw new Error('Unavailable');
    }
  });
  const before = store.getSnapshot().replay.state.habits[0];
  fail = true;
  store.change({
    kind: 'habit',
    habitId: before.id,
    index: 0,
    before,
    after: { ...before, description: 'My unfinished thought, now applied.' },
  });
  await assert.rejects(store.flush());
  assert.equal(
    raw.prepare('SELECT COUNT(*) AS count FROM changes').get().count,
    1,
  );
  assert.equal(
    (await repository.load()).replay.state.habits[0].description,
    undefined,
  );
  assert.ok(store.getSnapshot().error);
  await store.retry();
  await store.flush();
  const reopened = new ChangeStore(repository, metadata);
  await reopened.load();
  assert.equal(
    reopened.getSnapshot().replay.state.habits[0].description,
    'My unfinished thought, now applied.',
  );
});

test('v8 text size persists across reload and backup without breaking habit grouping or Redo', async (t) => {
  const { store, repository } = await fixture(t);
  assert.equal(store.getSnapshot().replay.state.textScale, undefined);
  store.change(entry(null, 10, 'read'));
  store.change({ kind: 'textScale', before: 1, after: 1.1 });
  store.change(entry(10, 20, 'read'));
  assert.equal(store.getSnapshot().replay.undo.length, 1);
  assert.equal(store.getSnapshot().replay.undo[0].editCount, 2);
  assert.ok(store.undo());
  store.change({ kind: 'textScale', before: 1.1, after: 1.5 });
  assert.equal(store.getSnapshot().replay.redo.length, 1);
  assert.ok(store.redo());
  await store.flush();
  const reopened = new ChangeStore(repository, metadata);
  await reopened.load();
  const snapshot = reopened.getSnapshot();
  assert.equal(snapshot.replay.state.textScale, 1.5);
  assert.equal(snapshot.replay.state.values['read:2026-10-04'], 20);
  assert.equal(snapshot.replay.undo.length, 1);
  const text = await encodeArchive(
    snapshot.events,
    '2026-10-05T03:00:00.000Z',
    digest,
  );
  assert.equal(JSON.parse(text).version, 20);
  const decoded = await decodeArchive(text, digest);
  assert.deepEqual(decoded.events, snapshot.events);
  assert.deepEqual(decoded.replay, snapshot.replay);
});

test('text-size event and projection roll back atomically; retry saves once', async (t) => {
  let fail = false;
  const { store, repository, raw } = await fixture(t, (sql) => {
    if (fail && sql.startsWith('INSERT INTO current_state')) {
      fail = false;
      throw new Error('Unavailable');
    }
  });
  fail = true;
  store.change({ kind: 'textScale', before: 1, after: 0.85 });
  await assert.rejects(store.flush());
  assert.equal(
    raw.prepare('SELECT COUNT(*) AS count FROM changes').get().count,
    1,
  );
  assert.equal((await repository.load()).replay.state.textScale, undefined);
  assert.ok(store.getSnapshot().error);
  await store.retry();
  await store.flush();
  const saved = await repository.load();
  assert.equal(saved.events.length, 2);
  assert.equal(saved.replay.state.textScale, 0.85);
});

test('text size requires v8 preference events, valid steps and before-values; logs cannot downgrade', () => {
  const initial = initialize();
  const event = {
    ...metadata(2),
    version: 8,
    type: 'preference',
    change: { kind: 'textScale', before: 1, after: 1.2 },
  };
  assert.equal(replayEvents([initial, event]).replay.state.textScale, 1.2);
  for (let version = 1; version <= 7; version++) {
    assert.throws(() => replayEvents([initial, { ...event, version }]));
  }
  for (const after of [0, 0.8, 1.025, 1.55, NaN, Infinity, '1.2', null]) {
    assert.throws(() =>
      replayEvents([initial, { ...event, change: { ...event.change, after } }]),
    );
  }
  assert.throws(() =>
    replayEvents([
      initial,
      { ...event, change: { ...event.change, before: 1.1 } },
    ]),
  );
  assert.throws(() =>
    replayEvents([initial, { ...event, type: 'change', groupId: event.id }]),
  );
  assert.throws(() =>
    replayEvents([
      initial,
      event,
      {
        ...metadata(3),
        version: 7,
        type: 'preference',
        change: { kind: 'haptics', before: true, after: false },
      },
    ]),
  );
});

test('v1–v7 backups accept v8 text size without rewriting their events, entries or Undo/Redo', async () => {
  const { readFileSync } = await import('node:fs');
  for (let version = 1; version <= 7; version++) {
    const { events, replay } = await decodeArchive(
      readFileSync(
        new URL(`../docs/examples/storage-v${version}.json`, import.meta.url),
        'utf8',
      ),
      digest,
    );
    const updated = [
      ...events,
      {
        ...metadata(events.length + 1),
        version: 8,
        type: 'preference',
        change: { kind: 'textScale', before: 1, after: 0.9 },
      },
    ];
    const decoded = await decodeArchive(
      await encodeArchive(updated, '2026-10-05T03:00:00.000Z', digest),
      digest,
    );
    assert.deepEqual(decoded.events.slice(0, -1), events);
    assert.deepEqual(decoded.replay.state, { ...replay.state, textScale: 0.9 });
    assert.deepEqual(decoded.replay.undo, replay.undo);
    assert.deepEqual(decoded.replay.redo, replay.redo);
  }
  const documented = await decodeArchive(
    readFileSync(
      new URL('../docs/examples/storage-v8.json', import.meta.url),
      'utf8',
    ),
    digest,
  );
  const v7 = await decodeArchive(
    readFileSync(
      new URL('../docs/examples/storage-v7.json', import.meta.url),
      'utf8',
    ),
    digest,
  );
  assert.deepEqual(documented.events.slice(0, -1), v7.events);
  assert.equal(documented.replay.state.textScale, 1.2);
  assert.deepEqual(documented.replay.undo, v7.replay.undo);
});

test('v9 completion preference survives SQLite reload and backup while preserving habit Redo', async (t) => {
  const { store, repository } = await fixture(t);
  assert.equal(store.getSnapshot().replay.state.hideCompleted, undefined);
  assert.equal(store.change(entry(null, 1)), true);
  assert.equal(store.undo(), true);
  assert.equal(
    store.change({ kind: 'hideCompleted', before: false, after: true }),
    true,
  );
  assert.equal(store.getSnapshot().events.at(-1).type, 'preference');
  assert.equal(store.getSnapshot().replay.undo.length, 0);
  assert.equal(store.getSnapshot().replay.redo.length, 1);
  await store.flush();
  const reopened = new ChangeStore(repository, metadata);
  await reopened.load();
  assert.equal(reopened.getSnapshot().replay.state.hideCompleted, true);
  assert.equal(reopened.redo(), true);
  assert.equal(
    reopened.getSnapshot().replay.state.values['walk:2026-10-04'],
    1,
  );
  assert.equal(reopened.getSnapshot().replay.undo.length, 1);
  assert.equal(reopened.undo(), true);
  assert.equal(reopened.getSnapshot().replay.state.hideCompleted, true);
  const text = await encodeArchive(
    reopened.getSnapshot().events,
    '2026-10-05T08:00:00.000Z',
    digest,
  );
  assert.equal(JSON.parse(text).version, 20);
  const decoded = await decodeArchive(text, digest);
  assert.equal(decoded.replay.state.hideCompleted, true);
  assert.equal(decoded.replay.redo.length, 1);
  await reopened.flush();
});
test('completion preference retains entry grouping and its default without reseeding old fixtures', async (t) => {
  const { store } = await fixture(t);
  store.change(entry(null, 1));
  store.change({ kind: 'hideCompleted', before: false, after: true });
  store.change(entry(1, null));
  assert.equal(store.getSnapshot().replay.undo.length, 0);
  assert.equal(store.getSnapshot().replay.state.hideCompleted, true);
  store.change({ kind: 'hideCompleted', before: true, after: false });
  assert.equal(store.getSnapshot().replay.undo.length, 0);
  await store.flush();
  for (let version = 1; version <= 8; version++) {
    const text = await import('node:fs').then((fs) =>
      fs.readFileSync(
        new URL(`../docs/examples/storage-v${version}.json`, import.meta.url),
        'utf8',
      ),
    );
    const decoded = await decodeArchive(text, digest);
    assert.equal(decoded.replay.state.hideCompleted, undefined);
  }
});
test('v9 completion validation rejects older schemas, malformed values and habit-action disguises', () => {
  const seed = initialize();
  const preference = {
    ...metadata(2),
    version: 9,
    type: 'preference',
    change: { kind: 'hideCompleted', before: false, after: true },
  };
  assert.equal(
    replayEvents([seed, preference]).replay.state.hideCompleted,
    true,
  );
  for (let version = 1; version < 9; version++)
    assert.throws(() => replayEvents([seed, { ...preference, version }]));
  for (const fields of [
    { after: 1 },
    { before: true },
    { after: null },
    { extra: true },
  ])
    assert.throws(() =>
      replayEvents([
        seed,
        { ...preference, change: { ...preference.change, ...fields } },
      ]),
    );
  assert.throws(() =>
    replayEvents([
      seed,
      { ...preference, type: 'change', groupId: preference.id },
    ]),
  );
  assert.throws(() =>
    replayEvents([
      seed,
      preference,
      {
        ...metadata(3),
        version: 8,
        type: 'change',
        groupId: 'older',
        change: entry(null, 1),
      },
    ]),
  );
});
test('failed completion preference write rolls back log and projection and retries once', async (t) => {
  let fail = false;
  const { raw, repository, store } = await fixture(t, (sql) => {
    if (fail && sql.startsWith('INSERT INTO current_state'))
      throw new Error('Disk full');
  });
  const original = raw
    .prepare('SELECT state_json FROM current_state')
    .get().state_json;
  fail = true;
  assert.equal(
    store.change({ kind: 'hideCompleted', before: false, after: true }),
    true,
  );
  await assert.rejects(store.flush());
  assert.equal(
    raw.prepare('SELECT COUNT(*) AS count FROM changes').get().count,
    1,
  );
  assert.equal(
    raw.prepare('SELECT state_json FROM current_state').get().state_json,
    original,
  );
  assert.ok(store.getSnapshot().error);
  fail = false;
  await store.retry();
  await store.flush();
  assert.equal(
    raw.prepare('SELECT COUNT(*) AS count FROM changes').get().count,
    2,
  );
  assert.equal((await repository.load()).replay.state.hideCompleted, true);
});
test('v9 documented backup retains its exact v8 prefix and supports subsequent undo/redo', async () => {
  const { readFileSync } = await import('node:fs');
  const old = JSON.parse(
    readFileSync(
      new URL('../docs/examples/storage-v8.json', import.meta.url),
      'utf8',
    ),
  );
  const decoded = await decodeArchive(
    readFileSync(
      new URL('../docs/examples/storage-v9.json', import.meta.url),
      'utf8',
    ),
    digest,
  );
  assert.deepEqual(decoded.events.slice(0, old.events.length), old.events);
  assert.equal(decoded.replay.state.hideCompleted, true);
  assert.equal(decoded.replay.state.textScale, 1.2);
  const undo = {
    ...metadata(11),
    version: 9,
    type: 'undo',
    targetId: 'v7-description',
    change: inverse(decoded.replay.undo.at(-1).change),
  };
  const undone = applyEvent(decoded.replay, undo);
  assert.equal(undone.state.habits[0].description, undefined);
  assert.equal(undone.state.hideCompleted, true);
  const redone = applyEvent(undone, {
    ...metadata(12),
    version: 9,
    type: 'redo',
    targetId: undo.id,
    change: decoded.replay.undo.at(-1).change,
  });
  assert.deepEqual(redone.state, decoded.replay.state);
});
