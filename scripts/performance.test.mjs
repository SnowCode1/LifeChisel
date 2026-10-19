import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  createPerformanceRecorder,
  validPerformanceReport,
} from '../packages/core/src/performanceModel.ts';
import { entrySelection } from '../packages/core/src/storage/selection.ts';
import { performanceFixture, nodeSqlPort } from './performance-fixture.mjs';
const plain = (value) => JSON.parse(JSON.stringify(value));
const example = () => ({
  version: 1,
  environment: 'development',
  platform: 'ios',
  source: 'saved',
  mode: 'normal',
  elapsedMs: 20000,
  metrics: { 'grid.ready': { count: 2, totalMs: 180, maxMs: 100 } },
});
test('anonymous aggregates have bounded names, immutable snapshots and no data-shaped labels', () => {
  const recorder = createPerformanceRecorder();
  recorder.record('grid.goal', 3);
  recorder.record('grid.goal', 5);
  const old = recorder.snapshot();
  recorder.record('private-habit-name', 30);
  recorder.record('grid.goal', NaN);
  recorder.record('grid.goal', -1);
  recorder.record('grid.goal', 2);
  assert.deepEqual(old, { 'grid.goal': { count: 2, totalMs: 8, maxMs: 5 } });
  assert.deepEqual(recorder.snapshot(), {
    'grid.goal': { count: 3, totalMs: 10, maxMs: 5 },
  });
  recorder.reset();
  assert.deepEqual(recorder.snapshot(), {});
});
test('report validation rejects extra payloads, arbitrary metric names and non-finite or unbounded values', () => {
  assert.equal(validPerformanceReport(example()), true);
  for (const mutate of [
    (p) => {
      p.habits = [];
    },
    (p) => {
      p.metrics.note = { count: 1, totalMs: 0, maxMs: 0 };
    },
    (p) => {
      p.metrics['grid.ready'].date = '2026-10-07';
    },
    (p) => {
      p.elapsedMs = Infinity;
    },
    (p) => {
      p.metrics['grid.ready'].count = -1;
    },
    (p) => {
      p.metrics['grid.ready'].maxMs = 190;
    },
    (p) => {
      p.environment = 'release';
    },
    (p) => {
      p.mode = 'canvas';
    },
  ]) {
    const value = example();
    mutate(value);
    assert.equal(validPerformanceReport(value), false);
  }
});

test('timing transport accepts only anonymous reports and propagates failed or missing save confirmation for Retry', async () => {
  const f = performanceFixture(),
    controller = new AbortController();
  let calls = 0;
  const success = async (url, options) => {
    calls++;
    assert.equal(url, 'http://paired-computer:8765/performance');
    assert.equal(options.signal, controller.signal);
    assert.deepEqual(JSON.parse(options.body), example());
    return { ok: true, status: 201, json: async () => ({ saved: true }) };
  };
  await f.uploadPerformance(
    example(),
    'http://paired-computer:8765/',
    'fake-test-token',
    success,
    controller.signal,
  );
  await assert.rejects(
    f.uploadPerformance(
      { ...example(), note: 'Must stay off the wire' },
      'http://paired-computer:8765',
      'fake-test-token',
      success,
      controller.signal,
    ),
    /invalid/,
  );
  assert.equal(calls, 1);
  for (const transport of [
    async () => {
      throw new Error('Network offline');
    },
    async () => ({ ok: false, status: 401 }),
    async () => ({ ok: true, json: async () => ({ saved: false }) }),
  ]) {
    await assert.rejects(
      f.uploadPerformance(
        example(),
        'http://paired-computer:8765',
        'fake-test-token',
        transport,
        controller.signal,
      ),
    );
  }
});
test('timing runs exclude mode-switch warmup, notify only on discrete changes, stop/reset and retain a retry snapshot', () => {
  const f = performanceFixture();
  let notified = 0;
  f.timing.performanceRun.subscribe(() => notified++);
  f.timing.performanceRun.start('simple-cells', 'ios', 'sample');
  f.timing.recordPerformance('grid.ready', 500);
  f.advance(2100);
  f.timing.recordPerformance('grid.ready', 100);
  f.timing.recordPerformance('sql.read', 5);
  assert.equal(notified, 1);
  const report = plain(f.timing.performanceRun.stop());
  assert.equal(report.mode, 'simple-cells');
  assert.equal(report.source, 'sample');
  assert.deepEqual(report.metrics['grid.ready'], {
    count: 1,
    totalMs: 100,
    maxMs: 100,
  });
  assert.equal(validPerformanceReport(report), true);
  assert.equal(f.timing.performanceRun.getMode(), 'normal');
  assert.equal(f.timing.performanceRun.isRunning(), false);
  assert.equal(f.timing.performanceRun.stop(), null);
  f.timing.recordPerformance('sql.read', 99);
  assert.deepEqual(plain(f.timing.performanceRun.getReport()), report);
  assert.equal(
    [...f.timers.values()].some((t) => t.interval || t.delay === 62000),
    false,
  );
  f.timing.performanceRun.start('no-goal-tint', 'ios', 'saved');
  f.advance(62000);
  [...f.timers.values()].find((t) => t.delay === 62000).fn();
  assert.equal(f.timing.performanceRun.isRunning(), false);
  assert.equal(f.timing.performanceRun.getMode(), 'normal');
  assert.equal(f.timing.performanceRun.getReport().mode, 'no-goal-tint');
  assert.equal(
    f.timing.performanceRun.getReport().metrics['sql.read'],
    undefined,
  );
});
test('production or disabled diagnostics leave SQL adapter identity and experiment mode untouched', () => {
  for (const options of [
    { development: false },
    { flag: false },
    { comparison: true },
  ]) {
    const f = performanceFixture(options),
      db = {};
    assert.equal(f.profileSql(db), db);
    f.timing.performanceRun.start('simple-cells', 'ios', 'saved');
    f.timing.recordPerformance('sql.read', 50);
    assert.equal(f.timing.performanceRun.getMode(), 'normal');
    assert.equal(f.timing.performanceRun.stop(), null);
    assert.equal(f.timers.size, 0);
  }
});
function fixture(t, fault) {
  const f = performanceFixture();
  const raw = new DatabaseSync(':memory:');
  t.after(() => raw.close());
  let id = 0;
  const meta = (sequence) => ({
    version: 17,
    sequence,
    id: `perf_${++id}`,
    recordedAt: '2026-10-07T00:00:00.000Z',
    timeZone: 'UTC',
    utcOffsetMinutes: 0,
  });
  const repository = f.sqliteRepository(
    nodeSqlPort(raw, fault),
    () => ({
      ...meta(1),
      type: 'initialize',
      habits: [{ id: 'habit', name: 'Fictional habit', color: '#82E6BC' }],
    }),
    // The sandbox has no crypto; a fixed device ID keeps the run deterministic.
    { newId: () => 'perf-device' },
  );
  return { ...f, repository, store: new f.ChangeStore(repository, meta), raw };
}
test('reading mounted entry selections is SQL-free; one durable edit records SQL and validation separately', async (t) => {
  const f = fixture(t);
  await f.store.load();
  f.timing.performanceRun.start('normal', 'ios', 'saved');
  f.advance(2100);
  for (let day = 1; day <= 30; day++) {
    const selected = entrySelection(
      f.store,
      `habit:2026-09-${String(day).padStart(2, '0')}`,
    );
    const unsub = selected.subscribe(() => {});
    selected.getSnapshot();
    unsub();
  }
  const readReport = f.timing.performanceRun.stop();
  assert.equal(readReport.metrics['sql.read'], undefined);
  assert.equal(readReport.metrics['sql.write'], undefined);
  f.timing.performanceRun.start('normal', 'ios', 'saved');
  f.advance(2100);
  assert.equal(
    f.store.change({
      kind: 'entry',
      habitId: 'habit',
      date: '2026-10-07',
      before: null,
      after: 1,
    }),
    true,
  );
  await f.store.flush();
  const report = f.timing.performanceRun.stop();
  assert.equal(report.metrics['sql.read'].count, 2);
  assert.equal(report.metrics['sql.write'].count, 2);
  assert.equal(report.metrics['sql.transaction'].count, 1);
  assert.equal(report.metrics['repository.append.validate'].count, 1);
  assert.equal(report.metrics['repository.projection.serialize'].count, 1);
  assert.equal(report.metrics['store.ack'].count, 1);
  assert.equal(validPerformanceReport(plain(report)), true);
  assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM changes').get().n, 2);
});

test('instrumented save failures preserve rollback, visible error, queued event and idempotent retry', async (t) => {
  let failing = false;
  const f = fixture(t, (sql) => {
    if (failing && sql.startsWith('INSERT INTO current_state')) {
      failing = false;
      throw new Error('Synthetic write failure');
    }
  });
  await f.store.load();
  f.timing.performanceRun.start('normal', 'ios', 'saved');
  f.advance(2100);
  failing = true;
  f.store.change({
    kind: 'entry',
    habitId: 'habit',
    date: '2026-10-07',
    before: null,
    after: 1,
  });
  await assert.rejects(f.store.flush());
  assert.equal(f.store.getSnapshot().events.length, 2);
  assert.equal(f.store.getSnapshot().pending, 1);
  assert.ok(f.store.getSnapshot().error);
  assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM changes').get().n, 1);
  await f.store.retry();
  await f.store.flush();
  assert.equal(f.store.getSnapshot().pending, 0);
  assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM changes').get().n, 2);
  const report = f.timing.performanceRun.stop();
  assert.equal(report.metrics['sql.transaction'].count, 2);
  assert.equal(report.metrics['store.ack'].count, 1);
});
