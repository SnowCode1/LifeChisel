import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChangeStore } from '../packages/core/src/storage/store.ts';
import { sqliteRepository } from '../packages/core/src/storage/repository.ts';
import {
  replayEvents,
  validateEvent,
  validateChange,
  applyEvent,
} from '../packages/core/src/storage/model.ts';
import {
  encodeArchive,
  decodeArchive,
} from '../packages/core/src/storage/archive.ts';
import {
  categorySelection,
  textEntry,
  entryLabel,
  cellEntryLabel,
  MAX_ENTRY_TEXT,
} from '../packages/core/src/entries.ts';
import { habitIsComplete } from '../packages/core/src/habitCompletion.ts';
import {
  recordedDaySelection,
  entrySelection,
} from '../packages/core/src/storage/selection.ts';
import { recordStatistics } from '../packages/core/src/recordStatistics.ts';
import { historyPresentation } from '../packages/core/src/history.ts';
import { createSampleStore } from '../packages/core/src/dev/sampleData.ts';

const today = '2026-10-05';
const categories = {
  id: 'exercise',
  name: 'Exercise',
  type: 'categorical',
  color: '#82E6BC',
  startDate: '2026-10-01',
  categories: [
    { id: 'run', label: 'Run' },
    { id: 'strength', label: 'Strength training', shortLabel: 'STR' },
  ],
};
const text = {
  id: 'highlight',
  name: 'Highlight',
  type: 'text',
  color: '#ED8DC3',
  startDate: '2026-10-01',
};
const legacy = [
  { id: 'walk', name: 'Walk', color: '#82E6BC' },
  { id: 'read', name: 'Read', color: '#BDA5FF', unit: 'minutes' },
];
let counter = 0;
const meta = (sequence) => ({
  version: 9,
  id: `entry-test-${++counter}`,
  sequence,
  recordedAt: '2026-10-05T08:00:00.000Z',
  timeZone: 'UTC',
  utcOffsetMinutes: 0,
});
const seed = () => ({
  ...meta(1),
  type: 'initialize',
  habits: structuredClone(legacy),
});
const digest = async (value) =>
  createHash('sha256').update(value).digest('hex');
function port(raw) {
  const db = {
    async execAsync(sql) {
      raw.exec(sql);
    },
    async runAsync(sql, ...args) {
      return raw.prepare(sql).run(...args);
    },
    async getFirstAsync(sql, ...args) {
      return raw.prepare(sql).get(...args) ?? null;
    },
    async getAllAsync(sql, ...args) {
      return raw.prepare(sql).all(...args);
    },
    async withExclusiveTransactionAsync(task) {
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
async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'onpurpose-entry-types-'));
  const raw = new DatabaseSync(join(dir, 'test.db'));
  t.after(() => {
    raw.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const repository = sqliteRepository(port(raw), seed);
  const store = new ChangeStore(repository, meta);
  await store.load();
  for (const habit of [categories, text])
    assert.equal(
      store.change({
        kind: 'habit',
        habitId: habit.id,
        index: store.getSnapshot().replay.state.habits.length,
        before: null,
        after: structuredClone(habit),
      }),
      true,
    );
  await store.flush();
  return { store, raw, repository };
}
function enter(store, habitId, after, date = today) {
  const before =
    store.getSnapshot().replay.state.values[`${habitId}:${date}`] ?? null;
  return store.change({
    kind: 'entry',
    habitId,
    date,
    before: structuredClone(before),
    after,
  });
}

test('text and multiple categories survive SQLite reload, serialized corrections, Undo/Redo and backup restore', async (t) => {
  const { store, repository, raw } = await fixture(t);
  const words = 'Coffee outside\nA quiet moment. ☕';
  assert.equal(
    enter(store, categories.id, categorySelection(['strength', 'run'])),
    true,
  );
  assert.equal(enter(store, text.id, words), true);
  assert.equal(enter(store, 'read', 0), true);
  assert.equal(enter(store, categories.id, ['run'], '2026-10-06'), true);
  await store.flush();
  const opened = new ChangeStore(repository, meta);
  await opened.load();
  assert.deepEqual(
    opened.getSnapshot().replay.state,
    store.getSnapshot().replay.state,
  );
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 1);
  assert.equal(opened.undo(), true);
  assert.equal(
    opened.getSnapshot().replay.state.values['exercise:2026-10-06'],
    undefined,
  );
  assert.equal(opened.redo(), true);
  assert.deepEqual(
    opened.getSnapshot().replay.state.values['exercise:2026-10-06'],
    ['run'],
  );
  await opened.flush();
  const encoded = await encodeArchive(
    opened.getSnapshot().events,
    '2026-10-05T09:00:00.000Z',
    digest,
  );
  assert.equal(JSON.parse(encoded).version, 22);
  const decoded = await decodeArchive(encoded, digest);
  assert.deepEqual(
    decoded.replay.state.values,
    opened.getSnapshot().replay.state.values,
  );
  assert.equal(decoded.events[0].version, 9);
  const disguised = JSON.parse(encoded);
  disguised.version = 9;
  await assert.rejects(
    decodeArchive(JSON.stringify(disguised), digest),
    /version/,
  );
  const beforeRestore = structuredClone(opened.getSnapshot().events);
  await opened.exclusive(() => opened.replace(decoded.events));
  assert.deepEqual(await opened.recoveryEvents(), beforeRestore);
});

test('multi-category corrections coalesce by value across reload; net-zero actions disappear and Redo survives preferences', async (t) => {
  const { store, repository } = await fixture(t);
  enter(store, categories.id, ['run']);
  enter(store, categories.id, ['run', 'strength']);
  assert.equal(store.getSnapshot().replay.undo.at(-1).editCount, 2);
  await store.flush();
  const opened = new ChangeStore(repository, meta);
  await opened.load();
  enter(opened, categories.id, ['strength']);
  assert.equal(opened.getSnapshot().replay.undo.at(-1).editCount, 3);
  assert.equal(opened.undo(), true);
  assert.equal(
    opened.getSnapshot().replay.state.values['exercise:' + today],
    undefined,
  );
  opened.change({ kind: 'haptics', before: true, after: false });
  assert.equal(opened.redo(), true);
  assert.deepEqual(
    opened.getSnapshot().replay.state.values['exercise:' + today],
    ['strength'],
  );
  const count = opened.getSnapshot().events.length;
  assert.equal(enter(opened, categories.id, ['strength']), false);
  assert.equal(opened.getSnapshot().events.length, count);
  enter(opened, categories.id, ['run']);
  enter(opened, categories.id, ['strength']);
  assert.equal(
    opened.getSnapshot().replay.undo.at(-1).change.after[0],
    'strength',
  );
  assert.equal(opened.getSnapshot().replay.undo.at(-1).editCount, 3);
  await opened.flush();
  assert.deepEqual(
    replayEvents(JSON.parse(JSON.stringify(opened.getSnapshot().events))).replay
      .state,
    opened.getSnapshot().replay.state,
  );
});

test('category renaming and archiving preserve stable entries, history, restoration and definition equality', async (t) => {
  const { store } = await fixture(t);
  enter(store, categories.id, ['run', 'strength']);
  let before = store
    .getSnapshot()
    .replay.state.habits.find((habit) => habit.id === categories.id);
  const after = {
    ...before,
    categories: before.categories.map((option) =>
      option.id === 'run'
        ? { ...option, label: 'Running', archived: true }
        : option,
    ),
  };
  const index = store.getSnapshot().replay.state.habits.indexOf(before);
  assert.equal(
    store.change({
      kind: 'habit',
      habitId: categories.id,
      index,
      before: structuredClone(before),
      after,
    }),
    true,
  );
  assert.equal(
    entryLabel(
      after,
      store.getSnapshot().replay.state.values['exercise:' + today],
    ),
    'Running, Strength training',
  );
  assert.equal(store.undo(), true);
  assert.equal(store.redo(), true);
  before = store.getSnapshot().replay.state.habits[index];
  assert.throws(
    () =>
      store.change({
        kind: 'habit',
        habitId: categories.id,
        index,
        before,
        after: {
          ...before,
          categories: before.categories.filter((option) => option.id !== 'run'),
        },
      }),
    /archive/,
  );
  assert.throws(
    () =>
      store.change({
        kind: 'habit',
        habitId: categories.id,
        index,
        before,
        after: {
          id: categories.id,
          name: 'Exercise',
          color: categories.color,
          type: 'text',
        },
      }),
    /type/,
  );
  assert.equal(
    store.change({
      kind: 'habit',
      habitId: categories.id,
      index,
      before,
      after: {
        ...before,
        categories: before.categories.map((option) => ({
          label: option.label,
          id: option.id,
          ...(option.shortLabel ? { shortLabel: option.shortLabel } : {}),
          ...(option.archived !== undefined
            ? { archived: option.archived }
            : {}),
        })),
      },
    }),
    false,
  );
  assert.equal(
    store.change({
      kind: 'habit',
      habitId: categories.id,
      index,
      before,
      after: { ...before, archived: true },
    }),
    true,
  );
  assert.deepEqual(
    store.getSnapshot().replay.state.values['exercise:' + today],
    ['run', 'strength'],
  );
  assert.equal(store.undo(), true);
  await store.flush();
});

test('new entry shapes reject old versions, bad values, wrong types and unknown selections without publishing state', async (t) => {
  const { store } = await fixture(t);
  for (const after of ['', ' '.repeat(20), 'x'.repeat(MAX_ENTRY_TEXT + 1)])
    assert.throws(() => enter(store, text.id, after));
  for (const after of [
    [],
    ['run', 'run'],
    ['strength', 'run'],
    ['missing'],
    1,
    'run',
  ])
    assert.throws(() => enter(store, categories.id, after));
  for (const [id, value] of [
    ['walk', 'yes'],
    ['walk', ['run']],
    ['read', '42'],
    [text.id, 42],
    [text.id, ['run']],
  ])
    assert.throws(() => enter(store, id, value));
  const change = {
    kind: 'entry',
    habitId: text.id,
    date: today,
    before: null,
    after: 'Valid text',
  };
  for (let version = 1; version < 10; version++) {
    assert.throws(() => validateChange(change, version));
    assert.throws(() =>
      validateEvent({ ...seed(), version, habits: [categories] }),
    );
    assert.throws(() => validateEvent({ ...seed(), version, habits: [text] }));
  }
  for (const habit of [
    { ...text, categories: categories.categories },
    { ...categories, unit: 'minutes' },
    {
      ...categories,
      categories: [{ id: 'run', label: 'Run', archived: true }],
    },
    {
      ...categories,
      categories: [...categories.categories, categories.categories[0]],
    },
    { ...categories, categories: [{ id: 'run', label: '' }] },
  ])
    assert.throws(() =>
      validateEvent({ ...seed(), version: 10, habits: [habit] }),
    );
  const state = structuredClone(store.getSnapshot().replay.state);
  assert.throws(
    () =>
      applyEvent(store.getSnapshot().replay, {
        ...meta(store.getSnapshot().events.length + 1),
        version: 9,
        type: 'preference',
        change: { kind: 'haptics', before: true, after: false },
      }),
    /version-10/,
  );
  assert.deepEqual(store.getSnapshot().replay.state, state);
  await store.flush();
});

test('new entries notify only their cells/date headings, and never count as completed without conditions', async (t) => {
  const { store } = await fixture(t);
  const own = entrySelection(store, 'highlight:' + today),
    other = entrySelection(store, 'exercise:' + today),
    heading = recordedDaySelection(store, [text, categories], today);
  let changed = 0,
    unrelated = 0,
    dates = 0;
  own.subscribe(() => changed++);
  other.subscribe(() => unrelated++);
  heading.subscribe(() => dates++);
  enter(store, text.id, 'A day worth remembering');
  await store.flush();
  assert.equal(changed, 1);
  assert.equal(unrelated, 0);
  assert.equal(dates, 1);
  enter(store, categories.id, ['run', 'strength']);
  await store.flush();
  assert.equal(changed, 1);
  assert.equal(unrelated, 1);
  assert.equal(dates, 1);
  assert.equal(habitIsComplete(text, 'text'), false);
  assert.equal(habitIsComplete(categories, ['run']), false);
  assert.equal(
    habitIsComplete(
      { id: 'read', name: 'Read', unit: 'min', color: '#ffffff' },
      1,
    ),
    false,
  );
  const presentation = historyPresentation(
    store.getSnapshot().replay.undo.at(-1),
    store.getSnapshot().replay.state,
  );
  assert.equal(presentation.icon, 'categories');
  assert.ok(presentation.summary.includes('Run, Strength training'));
  enter(store, categories.id, null);
  enter(store, text.id, null);
  assert.equal(heading.getSnapshot(), false);
  await store.flush();
});

test('record statistics use calendar start, retain multiple categories, and exclude future/pre-start entries', () => {
  const values = {
    'exercise:2026-09-30': ['run'],
    'exercise:2026-10-01': ['run', 'strength'],
    'exercise:2026-10-02': ['strength'],
    'exercise:2026-10-04': ['run'],
    'exercise:2026-10-06': ['run'],
    'highlight:2026-10-05': 'Something good',
    'walk:2026-10-03': 1,
  };
  const stats = recordStatistics(categories, values, [], today, 'all');
  assert.equal(stats.eligible, 5);
  assert.equal(stats.recorded, 3);
  assert.equal(stats.streak, 1);
  assert.equal(stats.bestStreak, 2);
  assert.deepEqual(
    stats.categories.map((option) => [option.id, option.count]),
    [
      ['run', 2],
      ['strength', 2],
    ],
  );
  assert.equal(stats.records[0].date, '2026-10-04');
  assert.deepEqual(
    recordStatistics(
      categories,
      { ...values, 'walk:2026-10-05': 1 },
      [],
      today,
      'all',
    ),
    stats,
  );
  assert.equal(recordStatistics(text, values, [], today, 30).recorded, 1);
  assert.equal(recordStatistics(text, values, [], today, 30).eligible, 5);
  assert.equal(
    recordStatistics(
      { ...text, startDate: '2026-10-06' },
      values,
      [],
      today,
      'all',
    ).eligible,
    0,
  );
});

test('cell previews are bounded without changing full text and selection normalization is deterministic', () => {
  assert.deepEqual(categorySelection(['strength', 'run', 'strength']), [
    'run',
    'strength',
  ]);
  assert.equal(categorySelection([]), null);
  assert.equal(textEntry(' \n '), null);
  assert.equal(textEntry('  A note\nMore.  '), '  A note\nMore.  ');
  assert.equal(cellEntryLabel(categories, ['run', 'strength']), 'Run · STR');
  assert.equal(
    cellEntryLabel(
      { ...categories, categories: [...categories.categories].reverse() },
      ['run', 'strength'],
    ),
    'STR · Run',
  );
  const words = '😀'.repeat(100) + '\nMore.';
  assert.equal(Array.from(cellEntryLabel(text, words)).length, 32);
  assert.equal(words.endsWith('\nMore.'), true);
  assert.equal(entryLabel(text, words), words);
});

test('isolated sample store includes varied categorical/text records while existing sample definitions stay separate', async () => {
  const store = await createSampleStore(today);
  for (const id of ['sample-workout', 'sample-highlight']) {
    const { replay, events } = store.getSnapshot();
    const habit = replay.state.habits.find((item) => item.id === id);
    const stats = recordStatistics(
      habit,
      replay.state.values,
      events,
      today,
      30,
    );
    assert.ok(stats.recorded > 10);
    assert.equal(stats.eligible, 30);
    if (id === 'sample-workout')
      assert.ok(stats.records.some((item) => item.value.length > 1));
    else
      assert.ok(stats.records.every((item) => typeof item.value === 'string'));
  }
});

test('v10 portable fixture retains the exact v9 prefix and replays multi-selection plus corrected text and Undo/Redo', async () => {
  const previous = JSON.parse(
    readFileSync(
      new URL('../docs/examples/storage-v9.json', import.meta.url),
      'utf8',
    ),
  );
  const fixture = readFileSync(
    new URL('../docs/examples/storage-v10.json', import.meta.url),
    'utf8',
  );
  const decoded = await decodeArchive(fixture, digest);
  assert.deepEqual(
    decoded.events.slice(0, previous.events.length),
    previous.events,
  );
  assert.deepEqual(decoded.replay.state.values['workout:2026-10-05'], [
    'run',
    'strength',
  ]);
  assert.equal(
    decoded.replay.state.values['highlight:2026-10-05'],
    'Coffee outside\nWatched the birds for a few minutes.',
  );
  assert.equal(decoded.replay.undo.at(-1).editCount, 2);
  assert.equal(decoded.replay.redo.length, 0);
});
