import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { ChangeStore } from '../packages/core/src/storage/store.ts';
import { sqliteRepository } from '../packages/core/src/storage/repository.ts';
import {
  applyChange,
  applyEvent,
  inverse,
  replayEvents,
  validateChange,
} from '../packages/core/src/storage/model.ts';
import {
  decodeArchive,
  encodeArchive,
} from '../packages/core/src/storage/archive.ts';
import {
  historyDisplayState,
  historyPresentation,
} from '../packages/core/src/history.ts';
import {
  archivedHabitDetails,
  archivedRecordRange,
} from '../packages/core/src/archivedHabitDetails.ts';

const date = '2026-10-06';
const habits = [
  {
    id: 'walk',
    name: 'Walk',
    color: '#82E6BC',
    type: 'checkbox',
    archived: true,
    description: '# Walk note',
    icon: 'emoji:🚶',
  },
  {
    id: 'read',
    name: 'Read',
    color: '#BDA5FF',
    type: 'number',
    unit: 'minutes',
    archived: true,
    goals: [
      {
        id: 'goal',
        from: date,
        weekdays: [1, 2, 3],
        rule: { kind: 'number', operator: 'atLeast', target: 20 },
      },
    ],
  },
  {
    id: 'workout',
    name: 'Workout',
    color: '#82E6BC',
    type: 'categorical',
    archived: true,
    categories: [
      { id: 'run', label: 'Run' },
      { id: 'stretch', label: 'Stretch', archived: true },
    ],
  },
  {
    id: 'note',
    name: 'Highlight',
    color: '#ED8DC3',
    type: 'text',
    archived: true,
  },
  { id: 'active', name: 'Active', color: '#82E6BC' },
];
const records = [
  1,
  0,
  ['run', 'stretch'],
  'A quiet afternoon\nwith a friend.',
  1,
];
let counter = 0;
const meta = (sequence) => ({
  version: 11,
  id: `delete-test-${++counter}`,
  sequence,
  recordedAt: '2026-10-06T08:00:00.000Z',
  timeZone: 'UTC',
  utcOffsetMinutes: 0,
});
const digest = async (value) =>
  createHash('sha256').update(value).digest('hex');

test('archive details count recorded days across all types and preserve saved order/date keys', () => {
  const values = {
    'read:2026-10-06': 0,
    'read:2025-12-31': 12,
    'read:2026-10-01': 10,
    'walk:2026-10-05': 1,
    'workout:2026-10-05': ['run', 'stretch'],
    'note:2026-10-06': 'A thought',
    'active:2026-10-06': 1,
    'read_more:2026-10-06': 100,
  };
  const original = structuredClone(values);
  const rows = archivedHabitDetails(habits, values);
  assert.deepEqual(
    rows.map((row) => row.habit.id),
    ['walk', 'read', 'workout', 'note'],
  );
  assert.deepEqual(
    rows.map((row) => row.count),
    [1, 3, 1, 1],
  );
  assert.equal(rows[1].firstDate, '2025-12-31');
  assert.equal(rows[1].lastDate, '2026-10-06');
  assert.deepEqual(values, original);
  assert.deepEqual(archivedHabitDetails([habits[0]], {})[0], {
    habit: habits[0],
    count: 0,
    firstDate: null,
    lastDate: null,
  });
  assert.equal(archivedRecordRange(date, date).includes('–'), false);
  const label = archivedRecordRange('2025-12-31', date);
  assert.match(label, /2025/);
  assert.match(label, /2026/);
});
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
async function fixture(t, definitions = habits) {
  const dir = mkdtempSync(join(tmpdir(), 'onpurpose-delete-'));
  let raw = new DatabaseSync(join(dir, 'test.db'));
  const initialize = () => ({
    ...meta(1),
    type: 'initialize',
    habits: structuredClone(definitions),
  });
  let repository = sqliteRepository(port(raw), initialize);
  const store = new ChangeStore(repository, meta);
  await store.load();
  for (const habit of definitions) {
    const index = habits.findIndex((h) => h.id === habit.id);
    store.change({
      kind: 'entry',
      habitId: habit.id,
      date,
      before: null,
      after: records[index] ?? 1,
    });
  }
  await store.flush();
  t.after(() => {
    raw.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    store,
    get raw() {
      return raw;
    },
    get repository() {
      return repository;
    },
    async reopen() {
      raw.close();
      raw = new DatabaseSync(join(dir, 'test.db'));
      repository = sqliteRepository(port(raw), initialize);
      const next = new ChangeStore(repository, meta);
      await next.load();
      return next;
    },
  };
}

test('deleting every record type is one atomic action, with exact reload/Undo/Redo and unchanged log prefix', async (t) => {
  const f = await fixture(t);
  let store = f.store;
  const original = structuredClone(store.getSnapshot().replay.state);
  const prefix = JSON.stringify(store.getSnapshot().events);
  for (const id of ['walk', 'read', 'workout', 'note']) {
    const before = structuredClone(store.getSnapshot().replay.state);
    const eventCount = store.getSnapshot().events.length;
    const undoCount = store.getSnapshot().replay.undo.length;
    assert.equal(store.deleteArchivedHabit(id), true);
    assert.equal(store.getSnapshot().events.length, eventCount + 1);
    assert.equal(store.getSnapshot().replay.undo.length, undoCount + 1);
    assert.equal(store.getSnapshot().replay.lastGroup, null);
    assert.equal(
      store.getSnapshot().replay.state.habits.some((h) => h.id === id),
      false,
    );
    assert.equal(
      Object.hasOwn(store.getSnapshot().replay.state.values, `${id}:${date}`),
      false,
    );
    assert.equal(store.getSnapshot().replay.state.values[`active:${date}`], 1);
    await store.flush();
    store = await f.reopen();
    assert.equal(store.getSnapshot().status, 'ready');
    assert.equal(store.undo(), true);
    assert.deepEqual(store.getSnapshot().replay.state, before);
    await store.flush();
    store = await f.reopen();
    assert.equal(store.redo(), true);
    await store.flush();
  }
  assert.equal(
    JSON.stringify(
      store.getSnapshot().events.slice(0, JSON.parse(prefix).length),
    ),
    prefix,
  );
  assert.equal(f.raw.prepare('PRAGMA user_version').get().user_version, 1);
  assert.deepEqual(store.getSnapshot().replay.state.habits, [
    original.habits.at(-1),
  ]);
  assert.deepEqual(store.getSnapshot().replay.state.values, {
    [`active:${date}`]: 1,
  });
});

test('backup round trip retains deletion and exact undo data; restore keeps a recovery copy', async (t) => {
  const f = await fixture(t);
  const before = structuredClone(f.store.getSnapshot().replay.state);
  f.store.deleteArchivedHabit('workout');
  await f.store.flush();
  const encoded = await encodeArchive(
    f.store.getSnapshot().events,
    meta(1).recordedAt,
    digest,
  );
  assert.equal(JSON.parse(encoded).version, 21);
  const decoded = await decodeArchive(encoded, digest);
  assert.deepEqual(decoded.replay.state, f.store.getSnapshot().replay.state);
  f.store.undo();
  await f.store.flush();
  await f.store.exclusive(() => f.store.replace(decoded.events));
  assert.deepEqual(
    replayEvents(await f.store.recoveryEvents()).replay.state,
    before,
  );
  assert.equal(f.store.undo(), true);
  assert.deepEqual(f.store.getSnapshot().replay.state, before);
  await f.store.flush();
  const disguised = JSON.parse(encoded);
  disguised.version = 11;
  await assert.rejects(
    decodeArchive(JSON.stringify(disguised), digest),
    /version does not support/,
  );
});

test('deletion validates full records, exact position/definition, archived state and undo inverse', async (t) => {
  const f = await fixture(t);
  const state = f.store.getSnapshot().replay.state;
  const change = {
    kind: 'deleteHabit',
    habitId: 'walk',
    index: 0,
    before: { habit: state.habits[0], entries: { [date]: 1 } },
    after: null,
  };
  for (const altered of [
    { ...change, index: 1 },
    { ...change, before: { ...change.before, entries: {} } },
    {
      ...change,
      before: { ...change.before, entries: { [date]: 1, '2026-10-05': 1 } },
    },
    {
      ...change,
      before: {
        ...change.before,
        habit: { ...change.before.habit, name: 'Wrong' },
      },
    },
  ])
    assert.throws(() => applyChange(state, altered), /precondition/);
  for (const altered of [
    {
      ...change,
      before: {
        ...change.before,
        habit: { ...change.before.habit, archived: false },
      },
    },
    { ...change, before: null },
    { ...change, after: change.before },
    { ...change, before: { ...change.before, entries: { '2026-02-30': 1 } } },
    { ...change, before: { ...change.before, entries: { [date]: null } } },
    { ...change, before: { ...change.before, entries: { [date]: 'Text' } } },
    { ...change, before: { ...change.before, extra: true } },
  ])
    assert.throws(() => validateChange(altered));
  for (let version = 1; version <= 11; version++)
    assert.throws(() => validateChange(change, version), /requires version 12/);
  const removed = applyChange(state, change);
  assert.deepEqual(applyChange(removed, inverse(change)), state);
  assert.throws(() => applyChange(state, inverse(change)), /precondition/);
  f.store.deleteArchivedHabit('walk');
  const event = f.store.getSnapshot().events.at(-1);
  assert.throws(
    () =>
      applyEvent(f.store.getSnapshot().replay, {
        ...meta(event.sequence + 1),
        version: 21,
        type: 'undo',
        targetId: event.id,
        change: { ...inverse(change), index: 1 },
      }),
    /undo target or inverse/,
  );
  assert.throws(
    () =>
      replayEvents([
        ...f.store.getSnapshot().events,
        {
          ...meta(event.sequence + 1),
          version: 11,
          type: 'preference',
          change: { kind: 'haptics', before: true, after: false },
        },
      ]),
    /version-21/,
  );
  await f.store.flush();
});

test('failed projection write rolls back deletion and retry commits once', async (t) => {
  const f = await fixture(t);
  const before = structuredClone(f.store.getSnapshot().replay.state);
  const eventCount = f.store.getSnapshot().events.length;
  f.raw.exec(
    "CREATE TRIGGER fail_delete BEFORE UPDATE ON current_state BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
  );
  f.store.deleteArchivedHabit('note');
  await assert.rejects(f.store.flush(), /retry/);
  assert.equal(
    f.raw.prepare('SELECT COUNT(*) AS count FROM changes').get().count,
    eventCount,
  );
  assert.deepEqual(
    JSON.parse(
      f.raw.prepare('SELECT state_json FROM current_state').get().state_json,
    ),
    before,
  );
  assert.equal(f.store.deleteArchivedHabit('walk'), false);
  const failedId = f.store.getSnapshot().events.at(-1).id;
  f.raw.exec('DROP TRIGGER fail_delete');
  await f.store.retry();
  await f.store.flush();
  assert.equal(f.store.getSnapshot().error, null);
  assert.equal(
    f.raw
      .prepare('SELECT COUNT(*) AS count FROM changes WHERE id = ?')
      .get(failedId).count,
    1,
  );
  assert.equal(
    (await f.reopen())
      .getSnapshot()
      .replay.state.habits.some((h) => h.id === 'note'),
    false,
  );
});

test('uncertain commit retries the same deletion without duplicating it', async (t) => {
  const f = await fixture(t);
  let loseAcknowledgement = true;
  const store = new ChangeStore(
    {
      ...f.repository,
      async append(event, state) {
        await f.repository.append(event, state);
        if (loseAcknowledgement) {
          loseAcknowledgement = false;
          throw new Error('Lost acknowledgement');
        }
      },
    },
    meta,
  );
  await store.load();
  store.deleteArchivedHabit('read');
  await assert.rejects(store.flush());
  const count = store.getSnapshot().events.length;
  await store.retry();
  await store.flush();
  assert.equal(
    f.raw.prepare('SELECT COUNT(*) AS count FROM changes').get().count,
    count,
  );
  assert.deepEqual(
    (await f.repository.load()).replay.state,
    store.getSnapshot().replay.state,
  );
});

test('rapid deletion/reorder/edit Undo preserves other slots and preference Redo', async (t) => {
  const f = await fixture(t);
  const original = structuredClone(f.store.getSnapshot().replay.state);
  f.store.deleteArchivedHabit('read');
  f.store.deleteArchivedHabit('walk');
  const before = f.store.getSnapshot().replay.state.habits.map((h) => h.id);
  f.store.change({ kind: 'order', before, after: [...before].reverse() });
  f.store.change({
    kind: 'entry',
    habitId: 'active',
    date,
    before: 1,
    after: null,
  });
  for (let i = 0; i < 4; i++) assert.equal(f.store.undo(), true);
  assert.deepEqual(f.store.getSnapshot().replay.state, original);
  f.store.change({ kind: 'haptics', before: true, after: false });
  assert.equal(f.store.getSnapshot().replay.redo.length, 4);
  for (let i = 0; i < 4; i++) assert.equal(f.store.redo(), true);
  await f.store.flush();
  assert.deepEqual(
    (await f.reopen()).getSnapshot().replay.state,
    f.store.getSnapshot().replay.state,
  );
});

test('last-habit deletion supports empty state, and stale/double confirmation cannot delete active habits', async (t) => {
  const f = await fixture(t, [habits[0]]);
  assert.equal(f.store.deleteArchivedHabit('missing'), false);
  const habit = f.store.getSnapshot().replay.state.habits[0];
  f.store.change({
    kind: 'habit',
    habitId: habit.id,
    index: 0,
    before: habit,
    after: { ...habit, archived: false },
  });
  assert.equal(f.store.deleteArchivedHabit(habit.id), false);
  f.store.undo();
  assert.equal(f.store.deleteArchivedHabit(habit.id), true);
  assert.equal(f.store.deleteArchivedHabit(habit.id), false);
  await f.store.flush();
  const reopened = await f.reopen();
  assert.deepEqual(reopened.getSnapshot().replay.state.habits, []);
  assert.deepEqual(reopened.getSnapshot().replay.state.values, {});
  assert.equal(reopened.undo(), true);
  assert.deepEqual(reopened.getSnapshot().replay.state.habits, [habit]);
  await reopened.flush();
});

test('History retains deleted habit names and entry summaries without resurrecting live records', async (t) => {
  const f = await fixture(t);
  const entry = f.store
    .getSnapshot()
    .replay.undo.find(
      (a) => a.change.kind === 'entry' && a.change.habitId === 'workout',
    );
  f.store.deleteArchivedHabit('workout');
  const replay = f.store.getSnapshot().replay;
  const display = historyDisplayState(replay.state, replay.undo);
  assert.equal(
    historyPresentation(replay.undo.at(-1), display).summary,
    'Habit deleted',
  );
  assert.equal(historyPresentation(entry, display).title, 'Workout');
  assert.match(historyPresentation(entry, display).summary, /Run, Stretch/);
  assert.equal(
    replay.state.habits.some((h) => h.id === 'workout'),
    false,
  );
  assert.equal(Object.hasOwn(display.values, `workout:${date}`), false);
  f.store.undo();
  assert.equal(
    historyDisplayState(
      f.store.getSnapshot().replay.state,
      f.store.getSnapshot().replay.undo,
    ),
    f.store.getSnapshot().replay.state,
  );
  await f.store.flush();
});

const source = readFileSync(
  new URL('../src/ArchivedHabits.tsx', import.meta.url),
  'utf8',
);
const file = ts.createSourceFile(
  'ArchivedHabits.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const confirmation = file.statements.find(
  (s) =>
    ts.isFunctionDeclaration(s) &&
    s.name?.text === 'confirmArchivedHabitDeletion',
);
const code = ts.transpileModule(
  `(${confirmation.getText(file).replace(/^export /, '')})`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
test('native deletion confirmation names the habit/count and only destructive acceptance deletes', () => {
  let alert,
    deleted = 0;
  const confirm = runInNewContext(
    code,
    {
      Platform: { OS: 'ios' },
      Alert: {
        alert: (...args) => {
          alert = args;
        },
      },
    },
    { timeout: 100 },
  );
  confirm(habits[0], 1, () => deleted++);
  assert.equal(deleted, 0);
  assert.match(alert[0], /Walk/);
  assert.match(alert[1], /1 recorded day\./);
  assert.match(alert[1], /undo this in History/);
  assert.equal(alert[2][0].style, 'cancel');
  alert[2][0].onPress?.();
  assert.equal(deleted, 0);
  assert.equal(alert[2][1].style, 'destructive');
  alert[2][1].onPress();
  assert.equal(deleted, 1);
  assert.equal(alert[3].cancelable, true);
});
test('web confirmation cancellation keeps records, and acceptance calls deletion once', () => {
  let accepted = false,
    deleted = 0,
    message;
  const confirm = runInNewContext(
    code,
    {
      Platform: { OS: 'web' },
      confirm: (text) => {
        message = text;
        return accepted;
      },
    },
    { timeout: 100 },
  );
  confirm(habits[0], 0, () => deleted++);
  assert.equal(deleted, 0);
  assert.match(message, /0 recorded days/);
  accepted = true;
  confirm(habits[0], 2, () => deleted++);
  assert.equal(deleted, 1);
});

test('v12 portable fixture extends the exact v11 prefix, and all legacy archives remain readable', async () => {
  for (let version = 1; version <= 12; version++) {
    const source = readFileSync(
      new URL(`../docs/examples/storage-v${version}.json`, import.meta.url),
      'utf8',
    );
    const decoded = await decodeArchive(source, digest);
    assert.equal(decoded.events.length, JSON.parse(source).eventCount);
  }
  const prefix = JSON.parse(
    readFileSync(
      new URL('../docs/examples/storage-v11.json', import.meta.url),
      'utf8',
    ),
  ).events;
  const { events, replay } = await decodeArchive(
    readFileSync(
      new URL('../docs/examples/storage-v12.json', import.meta.url),
      'utf8',
    ),
    digest,
  );
  assert.deepEqual(events.slice(0, prefix.length), prefix);
  assert.equal(
    replay.state.habits.some((h) => h.id === 'workout'),
    false,
  );
  const undo = {
    ...meta(events.length + 1),
    version: 12,
    type: 'undo',
    targetId: replay.undo.at(-1).id,
    change: inverse(replay.undo.at(-1).change),
  };
  const restored = applyEvent(replay, undo);
  assert.equal(restored.state.habits[1].id, 'workout');
  assert.deepEqual(restored.state.values['workout:2026-10-05'], [
    'run',
    'strength',
  ]);
});
