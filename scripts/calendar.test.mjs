import assert from 'node:assert/strict';
import test from 'node:test';
import {
  localDateKey,
  makeGridDays,
  millisecondsUntilTomorrow,
  calendarDay,
  entryDay,
} from '../packages/core/src/calendar.ts';

process.env.TZ = 'Australia/Melbourne';

test('calendar entry targets match grid dates and labels across time zones, DST and leap days', () => {
  for (const zone of [
    'Australia/Melbourne',
    'America/Los_Angeles',
    'Pacific/Auckland',
  ]) {
    process.env.TZ = zone;
    for (const today of [
      '2026-10-04',
      '2026-04-05',
      '2024-03-01',
      '2026-01-01',
    ]) {
      for (const day of makeGridDays(today, 35, 7)) {
        assert.deepEqual(entryDay(day.key), {
          key: day.key,
          fullLabel: day.fullLabel,
        });
        assert.equal(
          localDateKey(calendarDay(entryDay(day.key).key, 0)),
          day.key,
        );
      }
    }
  }
  process.env.TZ = 'Australia/Melbourne';
});

test('history starts at today and proceeds backwards, never to a future date', () => {
  const days = makeGridDays('2026-10-04', 90);
  assert.deepEqual(
    days.slice(0, 3).map((day) => day.key),
    ['2026-10-04', '2026-10-03', '2026-10-02'],
  );
  assert.ok(days.every((day) => day.key <= '2026-10-04'));
  assert.equal(new Set(days.map((day) => day.key)).size, 90);
  assert.throws(() => calendarDay('2026-10-04', 0.5));
});

test('loading older history preserves existing dates and indexes', () => {
  const first = makeGridDays('2026-10-04', 90);
  const expanded = makeGridDays('2026-10-04', 180);
  assert.deepEqual(expanded.slice(0, 90), first);
  assert.equal(expanded[90].key, localDateKey(calendarDay('2026-10-04', 90)));
});

test('calendar arithmetic handles month/year boundaries and leap days', () => {
  assert.equal(localDateKey(calendarDay('2026-01-01', 1)), '2025-12-31');
  assert.equal(localDateKey(calendarDay('2024-03-01', 1)), '2024-02-29');
  assert.equal(localDateKey(calendarDay('2025-03-01', 1)), '2025-02-28');
});

test('local dates and history remain correct across Melbourne daylight saving changes', () => {
  assert.equal(localDateKey(new Date('2026-10-03T14:30:00Z')), '2026-10-04');
  assert.deepEqual(
    makeGridDays('2026-10-05', 3).map((day) => day.key),
    ['2026-10-05', '2026-10-04', '2026-10-03'],
  );
  assert.deepEqual(
    makeGridDays('2026-04-06', 3).map((day) => day.key),
    ['2026-04-06', '2026-04-05', '2026-04-04'],
  );
  assert.equal(
    millisecondsUntilTomorrow(new Date('2026-10-04T00:00:00')),
    23 * 60 * 60 * 1000 + 100,
  );
  assert.equal(
    millisecondsUntilTomorrow(new Date('2026-04-05T00:00:00')),
    25 * 60 * 60 * 1000 + 100,
  );
});

test('a new current day does not change the identifier used for earlier entries', () => {
  const previousToday = makeGridDays('2026-10-04', 3)[0];
  const nextDay = makeGridDays('2026-10-05', 3)[1];
  assert.equal(previousToday.key, nextDay.key);
  assert.equal(
    millisecondsUntilTomorrow(new Date('2026-10-04T23:59:59')),
    1100,
  );
});

test('explicit future batches cross leap days and year boundaries without changing existing keys', () => {
  const past = makeGridDays('2026-12-31', 90);
  const expanded = makeGridDays('2026-12-31', 90, 30);
  assert.deepEqual(expanded.slice(30), past);
  assert.equal(expanded[29].key, '2027-01-01');
  assert.equal(expanded[29].daysAgo, -1);
  assert.equal(expanded[30].label, 'Today');
  assert.equal(localDateKey(calendarDay('2024-02-28', -1)), '2024-02-29');
  assert.equal(localDateKey(calendarDay('2024-02-28', -2)), '2024-03-01');
  assert.equal(localDateKey(calendarDay('2026-10-03', -1)), '2026-10-04');
  const nextBatch = makeGridDays('2026-12-31', 90, 60);
  assert.deepEqual(nextBatch.slice(30), expanded);
});
