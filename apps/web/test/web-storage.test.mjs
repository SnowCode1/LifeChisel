import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { ChangeStore } from '@onpurpose/core/storage/store';
import { sqliteRepository } from '@onpurpose/core/storage/repository';
import { eventMeta, initialEvent } from '@onpurpose/core/storage/newEvents';
import { handleSql } from '../src/storage/sqliteHandler.ts';
import { workerSql } from '../src/storage/workerSql.ts';

// The browser's SQLite build, in memory (Node has no OPFS). Messages cross an
// asynchronous channel like the real worker's, so ordering is exercised too.
const sqlite3 = await sqlite3InitModule();
function channel(db) {
  const port = {
    onmessage: null,
    postMessage(request) {
      setTimeout(() => port.onmessage({ data: handleSql(db, request) }));
    },
  };
  return port;
}
function open(db) {
  return new ChangeStore(
    sqliteRepository(workerSql(channel(db)), () => initialEvent(randomUUID())),
    (sequence) => eventMeta(sequence, randomUUID()),
  );
}

test('the shared repository creates schema 1 and keeps saved entries across reopening', async () => {
  const db = new sqlite3.oo1.DB(':memory:');
  const first = open(db);
  await first.load();
  assert.equal(first.getSnapshot().status, 'ready');
  const habit = first.getSnapshot().replay.state.habits[0];
  assert.ok(
    first.change({
      kind: 'entry',
      habitId: habit.id,
      date: '2026-10-13',
      before: null,
      after: 1,
    }),
  );
  await first.flush();
  assert.equal(db.selectValue('PRAGMA user_version'), 1);
  const second = open(db);
  await second.load();
  const snapshot = second.getSnapshot();
  assert.equal(snapshot.status, 'ready');
  assert.equal(snapshot.events.length, 2);
  assert.equal(snapshot.events[0].version, 21);
  assert.equal(snapshot.replay.state.values[`${habit.id}:2026-10-13`], 1);
  db.close();
});

test('a failed transaction rolls back and later statements still run', async () => {
  const db = new sqlite3.oo1.DB(':memory:');
  const sql = workerSql(channel(db));
  await sql.execAsync('CREATE TABLE t (v INTEGER NOT NULL)');
  await assert.rejects(
    sql.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync('INSERT INTO t (v) VALUES (?)', 1);
      await tx.runAsync('INSERT INTO t (v) VALUES (?)', null);
    }),
    /NOT NULL/,
  );
  // Queued behind the failed transaction, not interleaved with it.
  const pending = sql.getFirstAsync('SELECT COUNT(*) AS count FROM t');
  assert.equal((await pending).count, 0);
  await sql.withExclusiveTransactionAsync((tx) =>
    tx.runAsync('INSERT INTO t (v) VALUES (?)', 2),
  );
  assert.deepEqual(
    (await sql.getAllAsync('SELECT v FROM t')).map((row) => row.v),
    [2],
  );
  db.close();
});
