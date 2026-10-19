import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MAX_BATCH_PAYLOAD,
  MAX_PAYLOAD_LENGTH,
  MAX_PULL_EVENTS,
  MAX_PUSH_EVENTS,
  parseKeyRequest,
  parsePullQuery,
  parsePushRequest,
  parseResetRequest,
} from '../packages/core/src/sync/protocol.ts';
import { Mailbox } from '../apps/sync/src/mailbox.ts';

// The Durable Object's synchronous SQL, played by Node's SQLite.
function nodeSql(db) {
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

let epochs = 0;
function openMailbox(path = ':memory:', now) {
  const db = new DatabaseSync(path);
  const mailbox = new Mailbox(nodeSql(db), now, () => `epoch-${++epochs}`);
  mailbox.migrate();
  return { db, mailbox };
}

const sealed = (id, device = 'phone', payload = 'cGF5bG9hZA') => ({
  id,
  device,
  payload,
});
const push = (mailbox, expectedHead, events) =>
  mailbox.push({ epoch: mailbox.epoch(), expectedHead, events });

test('a new mailbox is empty and has an epoch', () => {
  const { mailbox } = openMailbox();
  assert.equal(mailbox.head(), 0);
  assert.match(mailbox.epoch(), /^epoch-\d+$/);
  assert.deepEqual(mailbox.pull(0, 10), {
    epoch: mailbox.epoch(),
    head: 0,
    events: [],
    more: false,
  });
  assert.equal(mailbox.key(), null);
});

test('pushes are numbered in arrival order with one arrival time', () => {
  const at = new Date('2026-10-18T01:02:03.000Z');
  const { mailbox } = openMailbox(':memory:', () => at);
  const epoch = mailbox.epoch();
  assert.deepEqual(push(mailbox, 0, [sealed('a'), sealed('b')]), {
    ok: true,
    epoch,
    head: 2,
    receivedAt: at.toISOString(),
  });
  assert.deepEqual(push(mailbox, 2, [sealed('c', 'web')]), {
    ok: true,
    epoch,
    head: 3,
    receivedAt: at.toISOString(),
  });
  const pulled = mailbox.pull(0, 10);
  assert.deepEqual(
    pulled.events.map((event) => [event.sequence, event.id, event.device]),
    [
      [1, 'a', 'phone'],
      [2, 'b', 'phone'],
      [3, 'c', 'web'],
    ],
  );
  assert.equal(pulled.events[0].receivedAt, at.toISOString());
  assert.deepEqual(
    mailbox.pull(2, 10).events.map((event) => event.id),
    ['c'],
  );
});

test('a device that is behind, or on an old epoch, is refused and nothing is stored', () => {
  const { mailbox } = openMailbox();
  push(mailbox, 0, [sealed('a')]);
  const epoch = mailbox.epoch();
  for (const expectedHead of [0, 2]) {
    assert.deepEqual(push(mailbox, expectedHead, [sealed('b')]), {
      ok: false,
      reason: 'behind',
      epoch,
      head: 1,
    });
  }
  assert.deepEqual(
    mailbox.push({ epoch: 'stale', expectedHead: 1, events: [sealed('b')] }),
    { ok: false, reason: 'reset', epoch, head: 1 },
  );
  assert.equal(mailbox.head(), 1);
});

test('a retried push that already succeeded is refused as a duplicate', () => {
  const { mailbox } = openMailbox();
  push(mailbox, 0, [sealed('a'), sealed('b')]);
  // The device missed the reply and resends with a fresh head: none of it is
  // stored, and pulling shows its events in the account's order.
  assert.deepEqual(push(mailbox, 2, [sealed('c'), sealed('b')]), {
    ok: false,
    reason: 'duplicate',
    epoch: mailbox.epoch(),
    head: 2,
  });
  assert.equal(mailbox.head(), 2);
  assert.deepEqual(
    mailbox.pull(0, 10).events.map((event) => event.id),
    ['a', 'b'],
  );
});

test('pulls page by count and by payload size', () => {
  const { mailbox } = openMailbox();
  push(
    mailbox,
    0,
    ['a', 'b', 'c', 'd', 'e'].map((id) => sealed(id)),
  );
  const first = mailbox.pull(0, 2);
  assert.deepEqual(
    [first.events.map((event) => event.id), first.more, first.head],
    [['a', 'b'], true, 5],
  );
  const last = mailbox.pull(4, 2);
  assert.deepEqual(
    [last.events.map((event) => event.id), last.more],
    [['e'], false],
  );

  const big = 'x'.repeat(MAX_PAYLOAD_LENGTH);
  const large = openMailbox().mailbox;
  for (let index = 0; index < 5; index += 1)
    push(large, index, [sealed(`big${index}`, 'phone', big)]);
  const page = large.pull(0, MAX_PULL_EVENTS);
  assert.equal(page.events.length, MAX_BATCH_PAYLOAD / MAX_PAYLOAD_LENGTH);
  assert.equal(page.more, true);
  // A page always makes progress, even when one event alone fills it.
  const solo = openMailbox().mailbox;
  push(solo, 0, [sealed('one', 'phone', big)]);
  assert.equal(solo.pull(0, 1).events.length, 1);
});

test('the wrapped key is set once, then only replaced by whoever saw it', () => {
  const { mailbox } = openMailbox();
  assert.deepEqual(mailbox.putKey({ wrapped: 'first', previous: 'x' }), {
    ok: false,
    wrapped: null,
  });
  assert.deepEqual(mailbox.putKey({ wrapped: 'first', previous: null }), {
    ok: true,
    wrapped: 'first',
  });
  assert.deepEqual(mailbox.putKey({ wrapped: 'other', previous: null }), {
    ok: false,
    wrapped: 'first',
  });
  assert.deepEqual(mailbox.putKey({ wrapped: 'second', previous: 'first' }), {
    ok: true,
    wrapped: 'second',
  });
  assert.equal(mailbox.key(), 'second');
});

test('a reset erases events and starts a new epoch but keeps the key; erase removes all', () => {
  const { mailbox } = openMailbox();
  push(mailbox, 0, [sealed('a')]);
  mailbox.putKey({ wrapped: 'key', previous: null });
  const before = mailbox.epoch();
  assert.deepEqual(mailbox.reset('wrong'), { ok: false, epoch: before });
  const reset = mailbox.reset(before);
  assert.equal(reset.ok, true);
  assert.notEqual(reset.epoch, before);
  assert.equal(mailbox.epoch(), reset.epoch);
  assert.equal(mailbox.head(), 0);
  assert.equal(mailbox.key(), 'key');
  // Events pushed against the old epoch are refused, then the new one works.
  assert.equal(
    mailbox.push({ epoch: before, expectedHead: 0, events: [sealed('b')] })
      .reason,
    'reset',
  );
  assert.equal(push(mailbox, 0, [sealed('b')]).ok, true);
  mailbox.erase();
  assert.equal(mailbox.head(), 0);
  assert.equal(mailbox.key(), null);
  assert.notEqual(mailbox.epoch(), reset.epoch);
});

test('events survive reopening, layout 1 upgrades in place, and a newer layout is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'onpurpose-mailbox-'));
  try {
    // A layout-1 mailbox as first deployed: events only, no epoch.
    const path = join(dir, 'mailbox.db');
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE mailbox_meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE TABLE events (sequence INTEGER PRIMARY KEY CHECK(sequence > 0), id TEXT UNIQUE NOT NULL, device TEXT NOT NULL, received_at TEXT NOT NULL, payload TEXT NOT NULL);
INSERT INTO mailbox_meta (key, value) VALUES ('schema', 1);
INSERT INTO events VALUES (1, 'old', 'curl', '2026-10-18T00:00:00.000Z', 'eA');`);
    old.close();

    const first = openMailbox(path);
    assert.equal(first.mailbox.head(), 1);
    const epoch = first.mailbox.epoch();
    assert.ok(epoch);
    push(first.mailbox, 1, [sealed('a')]);
    first.db.close();

    const second = openMailbox(path);
    assert.equal(second.mailbox.head(), 2);
    assert.equal(second.mailbox.epoch(), epoch);
    second.db.exec("UPDATE mailbox_meta SET value = 99 WHERE key = 'schema'");
    assert.throws(
      () => new Mailbox(nodeSql(second.db)).migrate(),
      /schema 99 is newer/,
    );
    second.db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('push, key and reset requests are checked strictly', () => {
  const valid = { epoch: 'e1', expectedHead: 0, events: [sealed('a')] };
  assert.deepEqual(parsePushRequest(valid), { ok: true, value: valid });
  const rejected = [
    null,
    [],
    { expectedHead: 0, events: [sealed('a')] },
    { ...valid, extra: 1 },
    { ...valid, epoch: '' },
    { ...valid, expectedHead: -1 },
    { ...valid, expectedHead: 1.5 },
    { ...valid, expectedHead: '0' },
    { ...valid, events: [] },
    {
      ...valid,
      events: Array.from({ length: MAX_PUSH_EVENTS + 1 }, (_, i) =>
        sealed(`e${i}`),
      ),
    },
    { ...valid, events: [sealed('a'), sealed('a')] },
    { ...valid, events: [{ ...sealed('a'), extra: 1 }] },
    { ...valid, events: [sealed('has space')] },
    { ...valid, events: [sealed('x'.repeat(65))] },
    { ...valid, events: [sealed('a', '')] },
    { ...valid, events: [sealed('a', 'phone', 'not+base64url')] },
    { ...valid, events: [sealed('a', 'phone', '')] },
    {
      ...valid,
      events: [sealed('a', 'phone', 'x'.repeat(MAX_PAYLOAD_LENGTH + 1))],
    },
    {
      ...valid,
      events: Array.from({ length: 5 }, (_, i) =>
        sealed(`e${i}`, 'phone', 'x'.repeat(MAX_PAYLOAD_LENGTH)),
      ),
    },
  ];
  for (const value of rejected)
    assert.equal(
      parsePushRequest(value).ok,
      false,
      JSON.stringify(value)?.slice(0, 80),
    );
  assert.equal(parseKeyRequest({ wrapped: 'abc', previous: null }).ok, true);
  for (const value of [
    { wrapped: 'abc' },
    { wrapped: 'a+b', previous: null },
    { wrapped: 'x'.repeat(1025), previous: null },
    { wrapped: 'abc', previous: 5 },
  ])
    assert.equal(parseKeyRequest(value).ok, false);
  assert.equal(parseResetRequest({ epoch: 'e1' }).ok, true);
  assert.equal(parseResetRequest({ epoch: 'e 1' }).ok, false);
});

test('pull queries are whole numbers within the page limit', () => {
  assert.deepEqual(parsePullQuery('0', null), {
    ok: true,
    value: { after: 0, limit: MAX_PULL_EVENTS },
  });
  assert.deepEqual(parsePullQuery('12', '3'), {
    ok: true,
    value: { after: 12, limit: 3 },
  });
  for (const [after, limit] of [
    [null, null],
    ['', null],
    ['-1', null],
    ['1.5', null],
    ['1e3', null],
    ['0', '0'],
    ['0', String(MAX_PULL_EVENTS + 1)],
    ['0', 'ten'],
  ])
    assert.equal(parsePullQuery(after, limit).ok, false, `${after} ${limit}`);
});
