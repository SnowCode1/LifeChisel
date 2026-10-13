import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { habitStatistics, monthDays } from '../packages/core/src/statistics.ts';
import { replayEvents } from '../packages/core/src/storage/model.ts';
const habit = { id: 'walk', name: 'Walk', color: '#82E6BC', type: 'checkbox' };
const number = { ...habit, type: 'number', unit: 'minutes' };
function seed(day = '2026-10-01', definition = habit) {
  return {
    version: 3,
    id: 'seed',
    sequence: 1,
    recordedAt: `${day}T12:00:00.000Z`,
    utcOffsetMinutes: 0,
    timeZone: 'UTC',
    type: 'initialize',
    habits: [definition],
  };
}
function definitionEvent(sequence, day, before, after, type = 'change') {
  return {
    version: 3,
    id: `event-${sequence}`,
    sequence,
    recordedAt: `${day}T12:00:00.000Z`,
    utcOffsetMinutes: 0,
    timeZone: 'UTC',
    type,
    ...(type === 'change'
      ? { groupId: `event-${sequence}` }
      : { targetId: `event-${sequence - 1}` }),
    change: { kind: 'habit', habitId: habit.id, index: 0, before, after },
  };
}
const stats = (
  values = {},
  events = [seed()],
  today = '2026-10-04',
  range = 30,
  definition = habit,
) => habitStatistics(definition, values, events, today, range);

test('rates use every calendar day from creation, including unfinished today', () => {
  const values = {
    'walk:2026-10-01': 1,
    'walk:2026-10-03': 1,
    'walk:2026-10-05': 1,
    'another:2026-10-02': 1,
  };
  const result = stats(values);
  assert.equal(result.eligible, 4);
  assert.equal(result.successes, 2);
  assert.equal(result.rate, 2 / 4);
  assert.equal(result.streak, 1);
  const checked = stats({ ...values, 'walk:2026-10-04': 1 });
  assert.equal(checked.eligible, 4);
  assert.equal(checked.rate, 3 / 4);
  assert.equal(checked.streak, 2);
  assert.equal(checked.bestStreak, 2);
  assert.equal(checked.allRecorded, 3);
});
test('new habits have one calendar day and days before creation stay outside the rate', () => {
  const result = stats({}, [seed('2026-10-04')]);
  assert.equal(result.rate, 0);
  assert.equal(result.eligible, 1);
  assert.equal(result.streak, 0);
  assert.equal(
    result.buckets
      .filter((bucket) => bucket.eligible === 0)
      .every((bucket) => bucket.value === null),
    true,
  );
  const older = stats();
  assert.equal(older.rate, 0);
  assert.equal(older.eligible, 4);
});
test('numeric average uses calendar days while zero stays recorded and blanks stay empty', () => {
  const result = stats(
    {
      'walk:2026-10-01': 10,
      'walk:2026-10-03': 0,
      'walk:2026-10-04': 20,
      'walk:2026-10-05': 1000,
    },
    [seed('2026-10-01', number)],
    '2026-10-04',
    30,
    number,
  );
  assert.equal(result.total, 30);
  assert.equal(result.average, 7.5);
  assert.equal(result.best, 20);
  assert.equal(result.recorded, 3);
  assert.equal(result.streak, 2);
  assert.equal(
    result.buckets.find((bucket) => bucket.start === '2026-10-03').value,
    0,
  );
  assert.equal(
    result.buckets.find((bucket) => bucket.start === '2026-10-02').value,
    null,
  );
  assert.equal(result.weekday.find((day) => day.day === 6).value, 0);
});
test('archiving hides habits without pausing their calendar period or losing entries', () => {
  const archived = { ...habit, archived: true };
  const events = [
    seed(),
    definitionEvent(2, '2026-10-03', habit, archived),
    definitionEvent(3, '2026-10-06', archived, habit),
  ];
  replayEvents(events);
  const result = stats(
    { 'walk:2026-10-01': 1, 'walk:2026-10-04': 1, 'walk:2026-10-06': 1 },
    events,
    '2026-10-08',
    'all',
  );
  assert.equal(result.eligible, 8); // Oct 1 through Oct 8, inclusive
  assert.equal(result.successes, 3);
  assert.equal(result.rate, 3 / 8);
  assert.equal(result.streak, 0);
  assert.equal(
    result.weekday.reduce((sum, day) => sum + day.eligible, 0),
    8,
  );
});
test('archive Undo and Redo do not change denominators or erase recorded days', () => {
  const archived = { ...habit, archived: true };
  const events = [
    seed(),
    definitionEvent(2, '2026-10-03', habit, archived),
    definitionEvent(3, '2026-10-04', archived, habit, 'undo'),
    definitionEvent(4, '2026-10-05', habit, archived, 'redo'),
  ];
  replayEvents(events);
  const result = stats(
    { 'walk:2026-10-03': 1 },
    events,
    '2026-10-08',
    'all',
    archived,
  );
  assert.equal(result.eligible, 8);
  assert.equal(result.rate, 1 / 8);
});
test('backdated records extend tracking, and month/day calculations survive DST and leap years', () => {
  const event = {
    ...seed('2026-10-03'),
    recordedAt: '2026-10-03T14:00:00.000Z',
    utcOffsetMinutes: 660,
    timeZone: 'Australia/Melbourne',
  };
  assert.equal(stats({}, [event], '2026-10-05').eligible, 2); // local creation Oct 4
  const result = stats({ 'walk:2026-09-30': 1 }, [event], '2026-10-05', 'all');
  assert.equal(result.trackingStart, '2026-09-30');
  assert.equal(result.eligible, 6);
  assert.equal(monthDays('2024-02').days.length, 29);
  assert.equal(monthDays('2026-02').days.length, 28);
  assert.equal(monthDays('2026-10').padding, 3);
});
test('bucket and weekday totals partition the selected period and previous comparison is equal length', () => {
  const result = stats(
    { 'walk:2026-09-01': 1, 'walk:2026-09-06': 1, 'walk:2026-10-04': 1 },
    [seed('2026-08-01')],
    '2026-10-04',
    30,
  );
  assert.equal(result.start, '2026-09-05');
  assert.equal(result.successes, 2);
  assert.equal(result.eligible, 30);
  assert.equal(result.previous.successes, 1);
  assert.equal(result.previous.eligible, 30);
  assert.equal(
    result.buckets.reduce((sum, bucket) => sum + bucket.eligible, 0),
    30,
  );
  assert.equal(
    result.weekday.reduce((sum, day) => sum + day.eligible, 0),
    30,
  );
  const values = Object.fromEntries(
    Array.from({ length: 30 }, (_, i) => [
      `walk:2026-09-${String(i + 1).padStart(2, '0')}`,
      i,
    ]),
  );
  const numeric = stats(
    values,
    [seed('2026-08-01', number)],
    '2026-10-04',
    90,
    number,
  );
  assert.equal(
    numeric.buckets.reduce((sum, bucket) => sum + (bucket.value ?? 0), 0),
    numeric.total,
  );
});
test('archive timestamp rollback does not change the calendar denominator', () => {
  const archived = { ...habit, archived: true };
  const events = [
    seed(),
    definitionEvent(2, '2026-10-05', habit, archived),
    definitionEvent(3, '2026-10-03', archived, habit),
  ];
  const result = stats({}, events, '2026-10-08', 'all');
  assert.equal(result.eligible, 8);
});
test('statistics can derive from unchanged v1/v2/v3/v4 backup fixtures', () => {
  for (const version of [1, 2, 3, 4]) {
    const archive = JSON.parse(
      readFileSync(
        new URL(`../docs/examples/storage-v${version}.json`, import.meta.url),
        'utf8',
      ),
    );
    const { events, replay } = replayEvents(archive.events);
    for (const definition of replay.state.habits) {
      const result = stats(
        replay.state.values,
        events,
        '2026-10-04',
        'all',
        definition,
      );
      assert.ok(result.rate === null || (result.rate >= 0 && result.rate <= 1));
      assert.ok(result.buckets.length > 0);
    }
  }
});

test('explicit start dates backfill the eligible period without requiring an entry', () => {
  const definition = { ...habit, startDate: '2026-09-28' };
  const result = stats({}, [seed()], '2026-10-04', 'all', definition);
  assert.equal(result.trackingStart, '2026-09-28');
  assert.equal(result.eligible, 7);
  assert.equal(result.recorded, 0);
  assert.equal(result.rate, 0);
});
test('moving the start date bounds a continuous period without deleting older entries', () => {
  const archived = { ...habit, archived: true };
  const events = [
    seed(),
    definitionEvent(2, '2026-10-03', habit, archived),
    definitionEvent(3, '2026-10-06', archived, habit),
  ];
  const values = {
    'walk:2026-10-01': 1,
    'walk:2026-10-02': 1,
    'walk:2026-10-04': 1,
    'walk:2026-10-06': 1,
  };
  const result = stats(values, events, '2026-10-08', 'all', {
    ...habit,
    startDate: '2026-10-02',
  });
  assert.equal(result.eligible, 7); // Oct 2 through Oct 8
  assert.equal(result.successes, 3);
  assert.equal(result.bestStreak, 1);
  assert.equal(Object.keys(values).length, 4);
  const backdated = stats(values, events, '2026-10-08', 'all', {
    ...habit,
    startDate: '2026-09-30',
  });
  assert.equal(backdated.eligible, 9);
  assert.equal(backdated.successes, 4);
  assert.equal(backdated.bestStreak, 2);
});
test('numeric totals, prior-period comparisons and future-start habits respect the explicit date', () => {
  const values = {
    'walk:2026-09-01': 100,
    'walk:2026-10-01': 10,
    'walk:2026-10-03': 0,
    'walk:2026-10-04': 20,
  };
  const result = stats(values, [seed()], '2026-10-04', 30, {
    ...number,
    startDate: '2026-10-03',
  });
  assert.equal(result.total, 20);
  assert.equal(result.average, 10);
  assert.equal(result.recorded, 2);
  assert.equal(result.previous.total, 0);
  assert.equal(result.previous.eligible, 0);
  const future = stats(values, [seed()], '2026-10-04', 'all', {
    ...number,
    startDate: '2026-10-10',
  });
  assert.equal(future.trackingStart, '2026-10-10');
  assert.equal(future.eligible, 0);
  assert.equal(future.recorded, 0);
  assert.equal(future.streak, 0);
  assert.equal(future.buckets.length, 1);
});

test('legacy start-date defaults reflect captured local creation or older entries without mutation', async () => {
  const { habitTrackingStart } =
    await import('../packages/core/src/statistics.ts');
  const events = [
    {
      ...seed('2026-10-03'),
      recordedAt: '2026-10-03T14:00:00.000Z',
      utcOffsetMinutes: 660,
    },
  ];
  const original = structuredClone(events);
  assert.equal(
    habitTrackingStart(habit, {}, events, '2026-10-05'),
    '2026-10-04',
  );
  assert.equal(
    habitTrackingStart(habit, { 'walk:2024-02-29': 1 }, events, '2026-10-05'),
    '2024-02-29',
  );
  assert.equal(
    habitTrackingStart(habit, { 'walk:2026-11-01': 1 }, events, '2026-10-05'),
    '2026-10-04',
  );
  assert.equal(
    habitTrackingStart(
      { ...habit, startDate: '2026-10-06' },
      {},
      events,
      '2026-10-05',
    ),
    '2026-10-06',
  );
  assert.deepEqual(events, original);
});

test('other habits entries and edits cannot change this habits rates, averages or inferred start', () => {
  const values = { 'walk:2026-10-02': 1 };
  const other = { ...habit, id: 'read', name: 'Read' };
  const events = [
    seed(),
    {
      ...definitionEvent(2, '2026-10-03', null, other),
      change: {
        kind: 'habit',
        habitId: other.id,
        index: 1,
        before: null,
        after: other,
      },
    },
  ];
  const before = stats(values, events, '2026-10-04', 'all');
  const after = stats(
    { ...values, 'read:2020-01-01': 1, 'read:2026-10-04': 1 },
    events,
    '2026-10-04',
    'all',
  );
  assert.deepEqual(after, before);
  const numericBefore = stats(
    { 'walk:2026-10-02': 20 },
    events,
    '2026-10-04',
    'all',
    number,
  );
  const numericAfter = stats(
    { 'walk:2026-10-02': 20, 'read:2026-10-04': 100 },
    events,
    '2026-10-04',
    'all',
    number,
  );
  assert.deepEqual(numericAfter, numericBefore);
  assert.equal(numericAfter.average, 5);
});
test('each habits own explicit start and selected range determine its average denominator', () => {
  const values = { 'walk:2026-10-01': 100, 'walk:2026-10-03': 12 };
  const early = stats(values, [seed()], '2026-10-04', 'all', {
    ...number,
    startDate: '2026-10-01',
  });
  const later = stats(values, [seed()], '2026-10-04', 'all', {
    ...number,
    startDate: '2026-10-03',
  });
  assert.equal(early.average, 28);
  assert.equal(later.average, 6);
  assert.equal(later.recorded, 1);
  const long = stats(
    { 'walk:2026-10-03': 30 },
    [seed('2026-01-01', number)],
    '2026-10-04',
    30,
    number,
  );
  assert.equal(long.eligible, 30);
  assert.equal(long.average, 1);
  assert.equal(
    long.weekday.reduce((sum, day) => sum + day.eligible, 0),
    30,
  );
});
