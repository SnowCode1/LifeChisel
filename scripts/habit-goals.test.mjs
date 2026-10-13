import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  evaluateGoal,
  ruleIsMet,
  validGoalTimeline,
  validSuccessRule,
  replaceGoal,
  resolveGoalDraft,
  ruleSummary,
  goalAt,
} from '../packages/core/src/habitGoals.ts';
import {
  habitIsComplete,
  completionMask,
} from '../packages/core/src/habitCompletion.ts';
import {
  completionStatistics,
  summarizeCompletion,
} from '../packages/core/src/completionStatistics.ts';
import { habitStatistics } from '../packages/core/src/statistics.ts';
import { recordStatistics } from '../packages/core/src/recordStatistics.ts';
import { ChangeStore } from '../packages/core/src/storage/store.ts';
import { sqliteRepository } from '../packages/core/src/storage/repository.ts';
import {
  validateEvent,
  replayEvents,
  sameValue,
} from '../packages/core/src/storage/model.ts';
import {
  encodeArchive,
  decodeArchive,
} from '../packages/core/src/storage/archive.ts';
import { completedHabitsSelection } from '../packages/core/src/storage/selection.ts';
import { historyPresentation } from '../packages/core/src/history.ts';
import {
  createSampleStore,
  createSampleEvents,
} from '../packages/core/src/dev/sampleData.ts';

const number = {
  id: 'read',
  name: 'Read',
  color: '#82E6BC',
  unit: 'minutes',
  startDate: '2026-10-01',
};
const categories = {
  ...number,
  id: 'workout',
  type: 'categorical',
  unit: undefined,
  categories: [
    { id: 'injury', label: 'Injury' },
    { id: 'run', label: 'Run' },
    { id: 'stretch', label: 'Stretch' },
  ],
};
const text = { ...number, id: 'note', type: 'text', unit: undefined };
const checkbox = {
  id: 'walk',
  name: 'Walk',
  type: 'checkbox',
  color: number.color,
  startDate: number.startDate,
};
const version = (id, from, rule, weekdays = [0, 1, 2, 3, 4, 5, 6]) => ({
  id,
  from,
  rule,
  weekdays,
});
const target = (n, operator = 'atLeast') => ({
  kind: 'number',
  operator,
  target: n,
});

test('numeric comparisons require an actual record, retain decimal boundaries and distinguish zero', () => {
  for (const rule of [
    target(0, 'atMost'),
    target(0, 'exactly'),
    target(0),
    { ...target(0, 'between'), upper: 1 },
  ])
    assert.equal(ruleIsMet(rule, undefined), false);
  assert.equal(ruleIsMet(target(0, 'exactly'), 0), true);
  assert.equal(ruleIsMet(target(2.5), 2.49), false);
  assert.equal(ruleIsMet(target(2.5), 2.5), true);
  assert.equal(ruleIsMet(target(2.5, 'atMost'), 2.5), true);
  assert.equal(ruleIsMet({ ...target(2.5, 'between'), upper: 3 }, 3), true);
  assert.equal(ruleIsMet({ ...target(2.5, 'between'), upper: 3 }, 3.1), false);
  assert.equal(ruleIsMet(target(0), '0'), false);
});

test('multi-category any/all/count and exclusions evaluate the complete set, never a blank', () => {
  const any = {
    kind: 'categories',
    match: 'any',
    ids: ['run', 'stretch'],
    exclude: ['injury'],
  };
  assert.equal(ruleIsMet(any, ['run']), true);
  assert.equal(ruleIsMet(any, ['injury', 'run']), false);
  assert.equal(ruleIsMet(any, []), false);
  assert.equal(ruleIsMet({ ...any, match: 'all' }, ['run']), false);
  assert.equal(ruleIsMet({ ...any, match: 'all' }, ['run', 'stretch']), true);
  assert.equal(
    ruleIsMet({ ...any, match: 'count', ids: [], count: 2 }, [
      'run',
      'stretch',
    ]),
    true,
  );
  assert.equal(ruleIsMet({ ...any, ids: [] }, ['stretch']), true);
  assert.equal(ruleIsMet({ ...any, ids: [] }, undefined), false);
  assert.equal(
    validSuccessRule({ ...any, ids: ['injury'] }, categories),
    false,
  );
  assert.equal(
    validSuccessRule({ ...any, match: 'count', ids: [], count: 4 }, categories),
    false,
  );
});

test('text matching is literal, case/whitespace-normalized and separate from tracking-only', () => {
  const rule = { kind: 'text', match: 'all', terms: ['A walk', 'FRIEND'] };
  assert.equal(ruleIsMet(rule, '  A   WALK\nwith a friend.  '), true);
  assert.equal(ruleIsMet(rule, 'A walk'), false);
  assert.equal(ruleIsMet({ ...rule, match: 'any' }, 'A walk'), true);
  assert.equal(ruleIsMet({ kind: 'recorded' }, ' \n '), false);
  assert.equal(ruleIsMet({ kind: 'recorded' }, 'A thought'), true);
  assert.equal(ruleIsMet({ kind: 'none' }, 'A thought'), false);
  assert.equal(
    validSuccessRule({ ...rule, terms: ['Walk', 'walk'] }, text),
    false,
  );
});

test('dated goal changes preserve original values and earlier goals, including future versions and backfill', () => {
  const goals = [
    version('first', '2026-10-01', target(10)),
    version('raised', '2026-10-05', target(20)),
    version('future', '2026-11-01', target(30)),
  ];
  const habit = { ...number, goals };
  assert.equal(habitIsComplete(habit, 15, '2026-10-04'), true);
  assert.equal(habitIsComplete(habit, 15, '2026-10-05'), false);
  assert.equal(habitIsComplete(habit, 25, '2026-11-01'), false);
  assert.equal(goalAt(habit, '2026-10-31').id, 'raised');
  assert.equal(goalAt(habit, '2026-09-30'), null);
  assert.equal(habitIsComplete(habit, 50, '2026-09-30'), false);
  assert.equal(habitIsComplete(number, 50, '2026-10-04'), false);
  const corrected = replaceGoal(goals, { ...goals[0], rule: target(12) });
  assert.equal(validGoalTimeline(corrected, number), true);
  assert.equal(corrected[1].rule.target, 20);
  assert.equal(ruleSummary(habit, goals[0].rule), 'At least 10 minutes');
  assert.equal(evaluateGoal(checkbox, 1, '2026-10-04').met, true);
  assert.equal(evaluateGoal(checkbox, 1, '2026-09-30').met, false);
});

test('category goals retain meaning across label changes and archival, and reject removal of referenced IDs', () => {
  const habit = {
    ...categories,
    goals: [
      version('goal', '2026-10-01', {
        kind: 'categories',
        match: 'any',
        ids: ['run'],
        exclude: ['injury'],
      }),
    ],
  };
  const renamed = {
    ...habit,
    categories: habit.categories.map((option) =>
      option.id === 'run'
        ? { ...option, label: 'Jogging', archived: true }
        : option,
    ),
  };
  assert.equal(validGoalTimeline(renamed.goals, renamed), true);
  assert.equal(evaluateGoal(renamed, ['run'], '2026-10-06').met, true);
  assert.equal(
    ruleSummary(renamed, renamed.goals[0].rule),
    'Any of Jogging · without Injury',
  );
  const removed = {
    ...habit,
    categories: habit.categories.filter((option) => option.id !== 'run'),
  };
  assert.equal(validGoalTimeline(removed.goals, removed), false);
});

test('v11 archive extends the exact v10 prefix with undoable dated goals and validates its checksum', async () => {
  const previous = JSON.parse(
    readFileSync(
      new URL('../docs/examples/storage-v10.json', import.meta.url),
      'utf8',
    ),
  );
  const file = readFileSync(
    new URL('../docs/examples/storage-v11.json', import.meta.url),
    'utf8',
  );
  const archive = JSON.parse(file);
  assert.deepEqual(
    archive.events.slice(0, previous.events.length),
    previous.events,
  );
  const decoded = await decodeArchive(file, async (value) =>
    createHash('sha256').update(value).digest('hex'),
  );
  const habit = decoded.replay.state.habits.find(
    (item) => item.id === 'workout',
  );
  assert.equal(habit.goals.length, 2);
  assert.equal(habit.goals[1].rule.match, 'all');
  assert.equal(decoded.events.at(-1).type, 'redo');
});

test('sample goals extend only the isolated log and retain the unchanged original preset history', async () => {
  const original = createSampleEvents('2026-10-06');
  const store = await createSampleStore('2026-10-06');
  const { events, replay } = store.getSnapshot();
  assert.deepEqual(events.slice(0, original.length), original);
  assert.equal(
    original[0].habits.some((habit) => habit.goals),
    false,
  );
  const read = replay.state.habits.find((habit) => habit.id === 'read');
  assert.equal(read.goals.length, 2);
  assert.equal(goalAt(read, '2026-09-21').rule.target, 15);
  assert.equal(goalAt(read, '2026-10-06').rule.target, 30);
  assert.equal(
    replay.state.habits.find((habit) => habit.id === 'sample-workout').goals[0]
      .rule.match,
    'any',
  );
});

test('scheduled streaks bridge non-applicable days, count opportunities since start and exclude extra/future records', () => {
  const habit = {
    ...number,
    startDate: '2026-10-02',
    goals: [version('mwf', '2026-10-02', target(10), [1, 3, 5])],
  };
  const values = {
    'read:2026-10-02': 10,
    'read:2026-10-03': 100,
    'read:2026-10-05': 15,
    'read:2026-10-07': 20,
    'read:2026-10-09': 30,
  };
  const stats = completionStatistics(
    habit,
    values,
    habit.startDate,
    '2026-10-07',
    habit.startDate,
  );
  assert.equal(stats.eligible, 3);
  assert.equal(stats.successes, 3);
  assert.equal(stats.streak, 3);
  assert.equal(stats.bestStreak, 3);
  assert.equal(stats.successDates.has('2026-10-03'), false);
  assert.equal(stats.successDates.has('2026-10-09'), false);
  const grace = completionStatistics(
    habit,
    { ...values, 'read:2026-10-07': 5 },
    habit.startDate,
    '2026-10-07',
    habit.startDate,
  );
  assert.equal(grace.streak, 2);
  assert.equal(
    completionStatistics(
      habit,
      { ...values, 'read:2026-10-07': 5 },
      habit.startDate,
      '2026-10-08',
      habit.startDate,
    ).streak,
    0,
  );
  assert.deepEqual(summarizeCompletion(stats, '2026-10-03', '2026-10-06'), {
    eligible: 1,
    successes: 1,
    rate: 1,
  });
});

test('weekday schedule changes retain previous schedules and do not change numeric calendar-day averages', () => {
  const habit = {
    ...number,
    goals: [
      version('daily', '2026-10-01', target(10)),
      version('mwf', '2026-10-05', target(20), [1, 3, 5]),
    ],
  };
  const values = {
    'read:2026-10-01': 10,
    'read:2026-10-02': 10,
    'read:2026-10-03': 10,
    'read:2026-10-04': 10,
    'read:2026-10-05': 20,
    'read:2026-10-06': 100,
  };
  const stats = habitStatistics(habit, values, [], '2026-10-06', 'all');
  assert.equal(stats.average, 160 / 6);
  assert.equal(stats.eligible, 6);
  assert.equal(stats.completion.eligible, 5);
  assert.equal(stats.completion.successes, 5);
  assert.equal(stats.completion.streak, 5);
  const data = {
    ...text,
    goals: [version('record', '2026-10-05', { kind: 'recorded' })],
  };
  const notes = recordStatistics(
    data,
    { 'note:2026-10-01': 'Older note', 'note:2026-10-05': 'New note' },
    [],
    '2026-10-06',
    'all',
  );
  assert.equal(notes.recorded, 2);
  assert.equal(notes.completion.eligible, 2);
  assert.equal(notes.completion.successes, 1);
});

test('strict timeline validation rejects collisions, unknown fields/types/options, empty schedules and sparse arrays', () => {
  const good = version('first', '2026-10-01', target(10));
  assert.equal(validGoalTimeline([good], number), true);
  for (const goals of [
    [],
    [good, { ...good, id: 'other' }],
    [{ ...good, weekdays: [] }],
    [{ ...good, weekdays: [1, 1] }],
    [{ ...good, weekdays: Array(1) }],
    [{ ...good, from: '2026-02-30' }],
    [{ ...good, extra: true }],
    [{ ...good, rule: { ...target(10, 'between'), upper: 5 } }],
    [{ ...good, rule: { kind: 'checked' } }],
    [good, { ...good, from: '2026-10-02' }],
  ])
    assert.equal(validGoalTimeline(goals, number), false);
  assert.equal(
    validSuccessRule(
      { kind: 'categories', match: 'any', ids: Array(1), exclude: [] },
      categories,
    ),
    false,
  );
  assert.equal(
    validSuccessRule({ kind: 'text', match: 'any', terms: Array(1) }, text),
    false,
  );
  assert.equal(
    validSuccessRule(
      { kind: 'number', operator: 'atLeast', target: Infinity },
      number,
    ),
    false,
  );
  assert.equal(
    validSuccessRule(
      { kind: 'categories', match: 'any', ids: ['unknown'], exclude: [] },
      categories,
    ),
    false,
  );
});

let counter = 0;
const meta = (sequence) => ({
  version: 11,
  id: `goal_test_${++counter}`,
  sequence,
  recordedAt: '2026-10-06T10:00:00.000Z',
  timeZone: 'UTC',
  utcOffsetMinutes: 0,
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
test('goal timelines survive actual SQLite serialization, reload, Undo/Redo and portable restore without modifying entries', async (t) => {
  const raw = new DatabaseSync(':memory:');
  t.after(() => raw.close());
  const repository = sqliteRepository(port(raw), () => ({
    ...meta(1),
    version: 10,
    type: 'initialize',
    habits: [number],
  }));
  const store = new ChangeStore(repository, meta);
  await store.load();
  store.change({
    kind: 'entry',
    habitId: number.id,
    date: '2026-10-04',
    before: null,
    after: 15,
  });
  const initial = store.getSnapshot().replay.state.habits[0];
  const after = {
    ...initial,
    goals: [
      version('old', '2026-10-01', target(10)),
      version('new', '2026-10-06', target(20)),
    ],
  };
  assert.equal(
    store.change({
      kind: 'habit',
      habitId: number.id,
      index: 0,
      before: initial,
      after,
    }),
    true,
  );
  await store.flush();
  const reopened = new ChangeStore(repository, meta);
  await reopened.load();
  assert.equal(
    habitIsComplete(
      reopened.getSnapshot().replay.state.habits[0],
      15,
      '2026-10-04',
    ),
    true,
  );
  const values = JSON.stringify(reopened.getSnapshot().replay.state.values);
  const action = reopened.getSnapshot().replay.undo.at(-1);
  assert.equal(
    historyPresentation(action, reopened.getSnapshot().replay.state).summary,
    'Goals edited',
  );
  assert.equal(reopened.undo(), true);
  await reopened.flush();
  assert.equal(reopened.getSnapshot().replay.state.habits[0].goals, undefined);
  assert.equal(reopened.redo(), true);
  await reopened.flush();
  assert.equal(
    sameValue(reopened.getSnapshot().replay.state.habits[0].goals, after.goals),
    true,
  );
  assert.equal(
    JSON.stringify(reopened.getSnapshot().replay.state.values),
    values,
  );
  const digest = async (value) =>
    createHash('sha256').update(value).digest('hex');
  const archive = await encodeArchive(
    reopened.getSnapshot().events,
    '2026-10-06T11:00:00.000Z',
    digest,
  );
  assert.equal(JSON.parse(archive).version, 20);
  const decoded = await decodeArchive(archive, digest);
  assert.equal(
    sameValue(decoded.replay.state.habits[0].goals, after.goals),
    true,
  );
  await reopened.exclusive(() => reopened.replace(decoded.events));
  assert.equal(
    JSON.stringify(reopened.getSnapshot().replay.state.values),
    values,
  );
  assert.equal(
    raw.prepare('SELECT COUNT(*) AS count FROM recovery_archives').get().count,
    1,
  );
});

test('numeric filtering notifies the grid container only when its completion mask changes, never for acknowledgements', async (t) => {
  const raw = new DatabaseSync(':memory:');
  t.after(() => raw.close());
  const habit = {
    ...number,
    goals: [version('goal', '2026-10-01', target(20))],
  };
  const store = new ChangeStore(
    sqliteRepository(port(raw), () => ({
      ...meta(1),
      type: 'initialize',
      habits: [habit],
    })),
    meta,
  );
  await store.load();
  const selection = completedHabitsSelection(
    store,
    [habit],
    '2026-10-06',
    true,
  );
  let notifications = 0;
  const stop = selection.subscribe(() => notifications++);
  t.after(stop);
  for (const [before, after] of [
    [null, 10],
    [10, 15],
    [15, 20],
    [20, 30],
    [30, 5],
  ]) {
    store.change({
      kind: 'entry',
      habitId: habit.id,
      date: '2026-10-06',
      before,
      after,
    });
    await store.flush();
  }
  assert.equal(notifications, 2);
  assert.equal(
    completionMask([habit], { 'read:2026-10-06': 25 }, '2026-10-06'),
    '1',
  );
});

test('old schema cannot carry goals, newer log prefixes cannot downgrade, and legacy fixtures retain exact replay', () => {
  const habit = {
    ...number,
    goals: [version('goal', '2026-10-01', target(20))],
  };
  for (let version = 1; version <= 10; version++)
    assert.throws(() =>
      validateEvent({
        ...meta(1),
        version,
        type: 'initialize',
        habits: [habit],
      }),
    );
  const initialized = { ...meta(1), type: 'initialize', habits: [habit] };
  assert.throws(
    () =>
      replayEvents([
        initialized,
        {
          ...meta(2),
          version: 10,
          type: 'preference',
          change: { kind: 'haptics', before: true, after: false },
        },
      ]),
    /version-11/,
  );
  for (let version = 1; version <= 10; version++) {
    const archive = JSON.parse(
      readFileSync(
        new URL(`../docs/examples/storage-v${version}.json`, import.meta.url),
        'utf8',
      ),
    );
    assert.equal(
      replayEvents(archive.events).events.length,
      archive.eventCount,
    );
  }
});

test('a new goal draft preserves Today when moved into the future, while explicit version editing retains its ID', () => {
  const current = version('today', '2026-10-06', target(35));
  const draft = version('new', '2026-10-06', target(40));
  assert.equal(resolveGoalDraft([current], draft, false).id, current.id);
  const future = { ...draft, from: '2026-10-10' };
  const result = replaceGoal(
    [current],
    resolveGoalDraft([current], future, false),
  );
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], current);
  assert.equal(result[1].rule.target, 40);
  assert.equal(
    resolveGoalDraft([current], { ...future, id: current.id }, true).id,
    current.id,
  );
});

test('checkbox completion, filtering and dated statistics agree before and after Undo/Redo', async (t) => {
  const raw = new DatabaseSync(':memory:');
  t.after(() => raw.close());
  const habit = {
    ...checkbox,
    goals: [version('scheduled', '2026-10-04', { kind: 'checked' }, [1, 3, 5])],
  };
  const store = new ChangeStore(
    sqliteRepository(port(raw), () => ({
      ...meta(1),
      type: 'initialize',
      habits: [habit],
    })),
    meta,
  );
  await store.load();
  for (const date of ['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-06'])
    store.change({
      kind: 'entry',
      habitId: habit.id,
      date,
      before: null,
      after: 1,
    });
  await store.flush();
  let values = store.getSnapshot().replay.state.values;
  assert.equal(
    evaluateGoal(habit, values['walk:2026-10-06'], '2026-10-06').met,
    true,
  );
  assert.equal(
    evaluateGoal(habit, values['walk:2026-10-06'], '2026-10-06').scheduled,
    false,
  );
  assert.equal(completionMask([habit], values, '2026-10-06'), '1');
  const stats = habitStatistics(
    habit,
    values,
    store.getSnapshot().events,
    '2026-10-06',
    'all',
  );
  assert.equal(stats.successes, 3);
  assert.equal(stats.eligible, 4);
  assert.equal(stats.streak, 2);
  assert.equal(store.undo(), true);
  await store.flush();
  values = store.getSnapshot().replay.state.values;
  assert.equal(completionMask([habit], values, '2026-10-06'), '0');
  assert.equal(
    evaluateGoal(habit, values['walk:2026-10-06'], '2026-10-06').met,
    false,
  );
  assert.equal(store.redo(), true);
  await store.flush();
  const reopened = new ChangeStore(
    sqliteRepository(port(raw), () => {
      throw new Error('Must not reseed');
    }),
    meta,
  );
  await reopened.load();
  assert.equal(
    completionMask(
      reopened.getSnapshot().replay.state.habits,
      reopened.getSnapshot().replay.state.values,
      '2026-10-06',
    ),
    '1',
  );
});
