// Two devices syncing through a real mailbox, with real encryption and real
// SQLite stores, as docs/SYNC.md describes. Fictional data only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { sqliteRepository } from '../packages/core/src/storage/repository.ts';
import { ChangeStore } from '../packages/core/src/storage/store.ts';
import { replayEvents } from '../packages/core/src/storage/model.ts';
import { Mailbox } from '../apps/sync/src/mailbox.ts';
import {
  SyncEngine,
  createAccountKey,
  replaceRecoveryCode,
  saveAccountKey,
  unlockAccountKey,
} from '../packages/core/src/sync/engine.ts';
import { conflictAlternative } from '../packages/core/src/sync/conflicts.ts';
import { SyncOffline } from '../packages/core/src/sync/client.ts';
import {
  combinePlan,
  restorePlan,
  suggestMatches,
} from '../packages/core/src/sync/plan.ts';
import {
  WrongRecoveryCode,
  newAccountKey,
  normalizeRecoveryCode,
  openEvent,
  sealEvent,
} from '../packages/core/src/sync/crypto.ts';

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
function syncSql(db) {
  return {
    all: (query, ...params) => db.prepare(query).all(...params),
    run: (query, ...params) => {
      db.prepare(query).run(...params);
    },
    transaction: (task) => {
      db.exec('BEGIN');
      try {
        const result = task();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

// One shared fake clock: every edit and sync step is a minute later.
function world() {
  let time = Date.parse('2026-10-18T09:00:00.000Z');
  const tick = () => new Date((time += 60_000));
  const mailbox = new Mailbox(
    syncSql(new DatabaseSync(':memory:')),
    () => tick(),
    () => `epoch${time}`,
  );
  mailbox.migrate();
  let ids = 0;
  const newId = () => `id${++ids}`;
  const api = (options = {}) => ({
    pull: async (after, limit = 500) =>
      structuredClone(mailbox.pull(after, limit)),
    push: async (request) => {
      if (options.offline) throw new SyncOffline();
      const result = mailbox.push(structuredClone(request));
      if (options.loseReply?.()) throw new Error('reply lost');
      return result;
    },
    keys: async () => structuredClone(mailbox.keys()),
    putKey: async (id, request) => structuredClone(mailbox.putKey(id, request)),
    deleteKey: async (id) => mailbox.deleteKey(id),
    createLink: async (request) => {
      if (!mailbox.createLink(request)) throw new Error('refused');
    },
    listLinks: async () => structuredClone(mailbox.links()),
    getLink: async (id) => structuredClone(mailbox.link(id)),
    postLink: async (id, step, value) => !!mailbox.postLink(id, step, value),
    reset: async (epoch) => mailbox.reset(epoch),
  });
  async function device(name, { habits = [], account = 'acct' } = {}) {
    const raw = new DatabaseSync(':memory:');
    let count = 0;
    const repository = sqliteRepository(
      port(raw),
      (device) => ({
        version: 24,
        id: `${name}-init`,
        sequence: 1,
        recordedAt: tick().toISOString(),
        timeZone: 'UTC',
        utcOffsetMinutes: 0,
        device,
        type: 'initialize',
        habits,
      }),
      { newId: () => `${name}-device` },
    );
    const store = new ChangeStore(repository, (sequence) => ({
      version: 24,
      id: `${name}-${++count}`,
      sequence,
      recordedAt: tick().toISOString(),
      timeZone: 'UTC',
      utcOffsetMinutes: 0,
    }));
    await store.load();
    return { name, raw, store, repository, account };
  }
  async function engine(dev, key, apiOptions) {
    const sync = new SyncEngine({
      store: dev.store,
      api: api(apiOptions),
      account: dev.account,
      server: 'test',
      key,
      newId,
      now: () => new Date(time),
    });
    return sync;
  }
  return { mailbox, api, device, engine, tick, newId };
}

const walk = { id: 'walk', name: 'Walk', color: '#82E6BC' };
const read = { id: 'read', name: 'Read', color: '#BDA5FF', unit: 'minutes' };
const state = (dev) => dev.store.getSnapshot().replay.state;
const entry = (habitId, date, before, after) => ({
  kind: 'entry',
  habitId,
  date,
  before,
  after,
});
const create = (dev, habit) =>
  dev.store.change({
    kind: 'habit',
    habitId: habit.id,
    index: state(dev).habits.length,
    before: null,
    after: habit,
  });
const value = (dev, habitId, date) =>
  state(dev).values[`${habitId}:${date}`] ?? null;

async function pair() {
  const w = world();
  const a = await w.device('a');
  const b = await w.device('b');
  const { key, code, wrapped } = await createAccountKey('acct');
  assert.equal(await saveAccountKey(w.api(), wrapped), true);
  const bKey = await unlockAccountKey(w.api(), 'acct', code);
  const syncA = await w.engine(a, key);
  const syncB = await w.engine(b, bKey);
  return { w, a, b, syncA, syncB, code, key };
}
// Same log, same order, same values on both devices.
function assertConverged(a, b) {
  const left = a.store.getSnapshot();
  const right = b.store.getSnapshot();
  assert.deepEqual(
    left.events.map((event) => event.id),
    right.events.map((event) => event.id),
  );
  assert.deepEqual(left.events, right.events);
  assert.deepEqual(left.replay.state.values, right.replay.state.values);
  assert.deepEqual(left.replay.state.habits, right.replay.state.habits);
  assert.equal(left.sync.confirmed, left.events.length);
  assert.equal(right.sync.confirmed, right.events.length);
}

test('the first device uploads its log; an empty device takes it; both then converge', async () => {
  const { a, b, syncA, syncB, w } = await pair();
  create(a, walk);
  a.store.change(entry('walk', '2026-10-17', null, 1));
  await syncA.sync();
  assert.equal(syncA.getStatus().state, 'idle');
  assert.equal(w.mailbox.head(), 3);
  // The server holds ciphertext only.
  const stored = w.mailbox.pull(0, 10).events.map((event) => event.payload);
  assert.ok(stored.every((payload) => !payload.includes('Walk')));
  await syncB.sync();
  assertConverged(a, b);
  assert.equal(value(b, 'walk', '2026-10-17'), 1);
  // B's data before linking is kept as a recovery copy.
  assert.equal(b.store.getSnapshot().hasRecovery, true);

  // Edits to different days on both, offline from each other, merge.
  a.store.change(entry('walk', '2026-10-18', null, 1));
  b.store.change(entry('walk', '2026-10-16', null, 1));
  await syncA.sync();
  await syncB.sync();
  await syncA.sync();
  assertConverged(a, b);
  assert.equal(value(a, 'walk', '2026-10-16'), 1);
  assert.equal(b.store.getSnapshot().conflicts.length, 0);
});

test('the same day changed differently: the later edit wins and the other is offered', async () => {
  const { a, b, syncA, syncB } = await pair();
  create(a, read);
  await syncA.sync();
  await syncB.sync();
  // A records first, B later; B syncs last, so B rebases onto A's edit.
  a.store.change(entry('read', '2026-10-18', null, 20));
  b.store.change(entry('read', '2026-10-18', null, 35));
  await syncA.sync();
  await syncB.sync();
  await syncA.sync();
  assertConverged(a, b);
  assert.equal(value(a, 'read', '2026-10-18'), 35);
  const [conflict] = b.store.getSnapshot().conflicts;
  assert.equal(b.store.getSnapshot().conflicts.length, 1);
  assert.equal(conflict.kind, 'entry');
  assert.equal(conflict.kept, 'this');
  assert.equal(conflict.otherValue, 20);
  // Switching to the other value is an ordinary, undoable edit.
  const alternative = conflictAlternative(state(b), conflict);
  assert.deepEqual(alternative, entry('read', '2026-10-18', 35, 20));
  assert.ok(b.store.change(alternative));
  await b.store.removeConflicts([conflict.id]);
  await syncB.sync();
  await syncA.sync();
  assertConverged(a, b);
  assert.equal(value(a, 'read', '2026-10-18'), 20);
  assert.equal(b.store.getSnapshot().conflicts.length, 0);
});

test('an older edit loses to a newer one from the other device', async () => {
  const { a, b, syncA, syncB } = await pair();
  create(a, read);
  await syncA.sync();
  await syncB.sync();
  b.store.change(entry('read', '2026-10-18', null, 35)); // earlier, offline
  a.store.change(entry('read', '2026-10-18', null, 20)); // later
  await syncA.sync();
  await syncB.sync();
  assertConverged(a, b);
  assert.equal(value(b, 'read', '2026-10-18'), 20);
  const [conflict] = b.store.getSnapshot().conflicts;
  assert.equal(conflict.kept, 'other');
  assert.equal(conflict.thisValue, 35);
  assert.deepEqual(
    conflictAlternative(state(b), conflict),
    entry('read', '2026-10-18', 20, 35),
  );
});

test('the same change on both devices merges silently', async () => {
  const { a, b, syncA, syncB } = await pair();
  create(a, walk);
  await syncA.sync();
  await syncB.sync();
  a.store.change(entry('walk', '2026-10-18', null, 1));
  b.store.change(entry('walk', '2026-10-18', null, 1));
  await syncA.sync();
  await syncB.sync();
  await syncA.sync();
  assertConverged(a, b);
  assert.equal(b.store.getSnapshot().conflicts.length, 0);
  // B's duplicate tick was dropped, not stored twice.
  assert.equal(
    b.store
      .getSnapshot()
      .events.filter((event) => event.change?.kind === 'entry').length,
    1,
  );
});

test('definition edits merge field by field; Undo after another device edits becomes an edit', async () => {
  const { a, b, syncA, syncB } = await pair();
  create(a, walk);
  await syncA.sync();
  await syncB.sync();
  a.store.change({
    kind: 'habit',
    habitId: 'walk',
    index: 0,
    before: state(a).habits[0],
    after: { ...state(a).habits[0], name: 'Evening walk' },
  });
  b.store.change({
    kind: 'habit',
    habitId: 'walk',
    index: 0,
    before: state(b).habits[0],
    after: { ...state(b).habits[0], icon: 'emoji:🚶' },
  });
  await syncA.sync();
  await syncB.sync();
  await syncA.sync();
  assertConverged(a, b);
  assert.equal(state(a).habits[0].name, 'Evening walk');
  assert.equal(state(a).habits[0].icon, 'emoji:🚶');
  assert.equal(b.store.getSnapshot().conflicts.length, 0);

  // B ticks, A ticks another day, then B undoes its tick before syncing:
  // after A's edit, B's Undo is no longer the newest action anywhere, so it
  // arrives as an ordinary change back.
  b.store.change(entry('walk', '2026-10-10', null, 1));
  await syncB.sync();
  await syncA.sync();
  a.store.change(entry('walk', '2026-10-11', null, 1));
  assert.ok(b.store.undo());
  await syncA.sync();
  await syncB.sync();
  await syncA.sync();
  assertConverged(a, b);
  assert.equal(value(a, 'walk', '2026-10-10'), null);
  assert.equal(value(a, 'walk', '2026-10-11'), 1);
  const last = b.store.getSnapshot().events.at(-1);
  assert.equal(last.type, 'change');
  assert.deepEqual(last.change, entry('walk', '2026-10-10', 1, null));
});

test('device preferences stay on their device; a new device follows until it chooses', async () => {
  const { a, b, syncA, syncB } = await pair();
  a.store.change({ kind: 'textScale', before: 1, after: 1.3 });
  a.store.change({ kind: 'weekStart', before: 'monday', after: 'sunday' });
  create(a, walk);
  await syncA.sync();
  await syncB.sync();
  // B has made no text-size choice of its own, so it follows A's.
  assert.equal(state(b).textScale, 1.3);
  assert.deepEqual(state(b).inheritedPreferences, ['textScale']);
  assert.equal(state(b).weekStart, 'sunday');
  b.store.change({ kind: 'textScale', before: 1.3, after: 0.9 });
  b.store.change({ kind: 'weekStart', before: 'sunday', after: 'monday' });
  await syncB.sync();
  await syncA.sync();
  assertConverged(a, b);
  // Text size is per device; week start is shared.
  assert.equal(state(a).textScale, 1.3);
  assert.equal(state(b).textScale, 0.9);
  assert.equal(state(b).inheritedPreferences, undefined);
  assert.equal(state(a).weekStart, 'monday');
  // Later choices on A no longer reach B.
  a.store.change({ kind: 'textScale', before: 1.3, after: 1.1 });
  await syncA.sync();
  await syncB.sync();
  assert.equal(state(b).textScale, 0.9);
});

test('first sync with data on both sides asks; combining adds this device’s habits as one action', async () => {
  const w = world();
  const a = await w.device('a');
  const b = await w.device('b');
  const { key, code, wrapped } = await createAccountKey('acct');
  await saveAccountKey(w.api(), wrapped);
  const syncA = await w.engine(a, key);
  const syncB = await w.engine(
    b,
    await unlockAccountKey(w.api(), 'acct', code),
  );
  create(a, walk);
  a.store.change(entry('walk', '2026-10-17', null, 1));
  await syncA.sync();
  // B has its own data: the same habit by name, and another.
  create(b, { ...walk, id: 'walk-b' });
  b.store.change(entry('walk-b', '2026-10-16', null, 1));
  b.store.change(entry('walk-b', '2026-10-17', null, 0));
  create(b, read);
  b.store.change(entry('read', '2026-10-17', null, 15));
  await syncB.sync();
  const status = syncB.getStatus();
  assert.equal(status.state, 'choice');
  assert.equal(status.reason, 'first');
  assert.deepEqual(status.choice.matches, { 'walk-b': 'walk', read: null });
  assert.equal(status.choice.cloudSummary.habits, 1);
  assert.equal(status.choice.localSummary.habits, 2);
  await syncB.choose('combine');
  await syncA.sync();
  assertConverged(a, b);
  assert.deepEqual(
    state(a).habits.map((habit) => habit.id),
    ['walk', 'read'],
  );
  // The cloud's value wins where both had one; the missing day was added.
  assert.equal(value(a, 'walk', '2026-10-16'), 1);
  assert.equal(value(a, 'walk', '2026-10-17'), 1);
  assert.equal(value(a, 'read', '2026-10-17'), 15);
  const combined = a.store.getSnapshot().replay.undo.at(-1);
  assert.equal(combined.change.kind, 'batch');
  assert.equal(combined.change.label, 'combine');
  // One Undo takes the whole combination back, everywhere.
  assert.ok(a.store.undo());
  await syncA.sync();
  await syncB.sync();
  assertConverged(a, b);
  assert.deepEqual(
    state(b).habits.map((habit) => habit.id),
    ['walk'],
  );
});

test('keeping this device erases the cloud copy; other devices with nothing unsent follow', async () => {
  const { a, b, syncA, syncB, w, code } = await pair();
  create(a, walk);
  await syncA.sync();
  await syncB.sync();
  // A third device with its own data chooses to keep it.
  const c = await w.device('c');
  const syncC = await w.engine(
    c,
    await unlockAccountKey(w.api(), 'acct', code),
  );
  create(c, read);
  await syncC.sync();
  assert.equal(syncC.getStatus().state, 'choice');
  await syncC.choose('device');
  assert.equal(syncC.getStatus().state, 'idle');
  await syncB.sync();
  assertConverged(b, c);
  assert.deepEqual(
    state(b).habits.map((habit) => habit.id),
    ['read'],
  );
  // A had an unsent edit, so it is asked instead of following silently.
  a.store.change(entry('walk', '2026-10-18', null, 1));
  await syncA.sync();
  assert.equal(syncA.getStatus().state, 'choice');
  assert.equal(syncA.getStatus().reason, 'reset');
  await syncA.choose('cloud');
  assertConverged(a, c);
});

test('a lost push reply is recovered by pulling; offline edits wait and then sync', async () => {
  const w = world();
  const a = await w.device('a');
  const b = await w.device('b');
  const { key } = await createAccountKey('acct');
  let lose = false;
  const syncA = await w.engine(a, key, {
    loseReply: () => lose && !(lose = false),
  });
  create(a, walk);
  await syncA.sync();
  a.store.change(entry('walk', '2026-10-18', null, 1));
  lose = true;
  await syncA.sync(); // the push lands but its reply is lost
  syncA.stop();
  await syncA.sync(); // pulls its own events back and confirms them
  assert.equal(syncA.getStatus().state, 'idle');
  assert.equal(w.mailbox.head(), a.store.getSnapshot().events.length);
  assert.equal(
    new Set(w.mailbox.pull(0, 50).events.map((e) => e.id)).size,
    w.mailbox.head(),
  );
  const offline = await w.engine(a, key, { offline: true });
  a.store.change(entry('walk', '2026-10-17', null, 1));
  await offline.sync();
  offline.stop();
  assert.equal(offline.getStatus().state, 'offline');
  await syncA.sync();
  const syncB = await w.engine(b, key);
  await syncB.sync();
  assertConverged(a, b);
});

test('a wrong key cannot read the cloud and changes nothing here', async () => {
  const { a, b, syncA, w } = await pair();
  create(a, walk);
  await syncA.sync();
  const before = b.store.getSnapshot().events;
  const wrong = await w.engine(b, await newAccountKey());
  await wrong.sync();
  wrong.stop();
  assert.equal(wrong.getStatus().state, 'error');
  assert.deepEqual(b.store.getSnapshot().events, before);
  assert.equal(b.store.getSnapshot().sync, null);
});

test('recovery codes unlock only their account, tolerate reading mistakes and can be replaced', async () => {
  const w = world();
  const { key, code, wrapped } = await createAccountKey('acct');
  await saveAccountKey(w.api(), wrapped);
  // Lower case, spaces and the look-alikes I/L/O are accepted.
  const sloppy = code.toLowerCase().replace(/-/g, ' ').replace(/1/g, 'l');
  assert.equal(normalizeRecoveryCode(sloppy), code.replace(/-/g, ''));
  const unlocked = await unlockAccountKey(w.api(), 'acct', sloppy);
  const sealed = await sealEvent(key, { id: 'x', sequence: 1, v: 1 }, 'dev');
  const opened = await openEvent(unlocked, {
    ...sealed,
    sequence: 1,
    receivedAt: '2026-10-18T00:00:00.000Z',
  });
  assert.equal(opened.v, 1);
  await assert.rejects(
    unlockAccountKey(w.api(), 'other-account', code),
    WrongRecoveryCode,
  );
  // A sealed event cannot be moved to another position or device.
  await assert.rejects(
    openEvent(unlocked, { ...sealed, sequence: 2, receivedAt: '' }),
  );
  await assert.rejects(
    openEvent(unlocked, {
      ...sealed,
      device: 'other',
      sequence: 1,
      receivedAt: '',
    }),
  );
  const next = await replaceRecoveryCode(w.api(), 'acct', key);
  await assert.rejects(
    unlockAccountKey(w.api(), 'acct', code),
    WrongRecoveryCode,
  );
  assert.ok(await unlockAccountKey(w.api(), 'acct', next));
});

test('restore plans bring back what is missing, or make everything match, as one batch', async () => {
  const w = world();
  const a = await w.device('a');
  create(a, walk);
  create(a, read);
  a.store.change(entry('walk', '2026-10-01', null, 1));
  a.store.change(entry('read', '2026-10-01', null, 10));
  await a.store.flush();
  const backup = a.store.getSnapshot().replay.state;
  a.store.change(entry('read', '2026-10-01', 10, 30));
  a.store.change(entry('walk', '2026-10-01', 1, null));
  a.store.change({
    kind: 'habit',
    habitId: 'extra',
    index: 2,
    before: null,
    after: { id: 'extra', name: 'Extra', color: '#ACB8C5' },
  });
  const missing = restorePlan(state(a), backup, 'missing');
  assert.deepEqual(missing.changes, [entry('walk', '2026-10-01', null, 1)]);
  const match = restorePlan(state(a), backup, 'match');
  assert.ok(a.store.applyBatch('restore', match.changes));
  assert.equal(value(a, 'read', '2026-10-01'), 10);
  assert.equal(value(a, 'walk', '2026-10-01'), 1);
  assert.equal(state(a).habits.find((h) => h.id === 'extra').archived, true);
  assert.ok(a.store.undo());
  assert.equal(value(a, 'read', '2026-10-01'), 30);
  // Plans replay from a log like any action.
  await a.store.flush();
  assert.deepEqual(
    replayEvents(a.store.getSnapshot().events).replay.state,
    state(a),
  );
  // Matching suggestions: same ID, else same name and kind.
  assert.deepEqual(
    suggestMatches(backup, {
      ...backup,
      habits: [{ ...walk, id: 'w2', name: ' walk ' }, read],
    }),
    { w2: 'walk', read: 'read' },
  );
  // Combining identical data adds nothing once habits are matched; unmatched
  // habits are added as separate ones under new IDs, with their days.
  assert.equal(
    combinePlan(backup, backup, suggestMatches(backup, backup), w.newId).changes
      .length,
    0,
  );
  const separate = combinePlan(backup, backup, {}, w.newId).changes;
  assert.equal(separate.length, 4);
  assert.ok(separate.every((change) => change.habitId !== 'walk'));
});
