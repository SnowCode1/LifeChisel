import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compactVisibleDays,
  readGridMode,
} from '../packages/core/src/gridModes.ts';
import {
  compactTotal,
  weekColumnStart,
  weekJumpDay,
  weekSummary,
  weeksAgoOf,
} from '../packages/core/src/weekSummary.ts';
import { ordinal } from '../packages/core/src/goalTiming.ts';

// 2026-10-16 is a Friday; its Monday week starts on 12 October.
const today = '2026-10-16';
const monday = ordinal('2026-10-12');
const everyDay = [0, 1, 2, 3, 4, 5, 6];
const walk = {
  id: 'walk',
  name: 'Walk',
  color: '#82E6BC',
  startDate: '2026-01-05',
};
const values = (id, entries) =>
  Object.fromEntries(
    Object.entries(entries).map(([date, value]) => [`${id}:${date}`, value]),
  );

test('unknown remembered modes fall back to the grid', () => {
  assert.equal(readGridMode('weeks'), 'weeks');
  assert.equal(readGridMode('table'), 'grid');
  assert.equal(readGridMode(null), 'grid');
});

test('compact mode fits a week of days when columns stay usable', () => {
  // A portrait phone: 5 normal 56 pt days, but 7 at 36 pt or more.
  assert.equal(compactVisibleDays(320, 56, 36), 7);
  // Large text: 7 would be too narrow, so as many as the minimum allows.
  assert.equal(compactVisibleDays(200, 80, 36), 5);
  // Landscape keeps every normal column.
  assert.equal(compactVisibleDays(800, 56, 36), 14);
});

test('week columns count back from the current week', () => {
  assert.equal(weekColumnStart(today, 'monday', 0), monday);
  assert.equal(weekColumnStart(today, 'monday', 2), monday - 14);
  assert.equal(weekColumnStart(today, 'sunday', 0), ordinal('2026-10-11'));
  assert.equal(weeksAgoOf(today, 'monday', '2026-10-05'), 1);
  assert.equal(weeksAgoOf(today, 'monday', '2026-10-19'), -1);
  // Jumping shows the week's last day at the right; the current week keeps
  // Today there.
  assert.equal(weekJumpDay(today, 'monday', 0), 0);
  assert.equal(weekJumpDay(today, 'monday', 1), 5);
});

test('a daily checkbox week counts done days and shows missed ones', () => {
  const week = monday - 7; // 5–11 October, finished
  const all = values('walk', {
    '2026-10-05': 1,
    '2026-10-06': 1,
    '2026-10-08': 1,
  });
  const summary = weekSummary(walk, all, today, week);
  assert.deepEqual(summary.dots, [
    'done',
    'done',
    'missed',
    'done',
    'missed',
    'missed',
    'missed',
  ]);
  assert.equal(summary.label, '3');
  assert.equal(summary.met, false);

  const full = values(
    'walk',
    Object.fromEntries(
      Array.from({ length: 7 }, (_, i) => [
        new Date((week + i) * 86400000).toISOString().slice(0, 10),
        1,
      ]),
    ),
  );
  assert.equal(weekSummary(walk, full, today, week).met, true);
});

test('the current week stays open: Today is empty and future days blank', () => {
  const summary = weekSummary(
    walk,
    values('walk', {
      '2026-10-12': 1,
      '2026-10-13': 1,
      '2026-10-14': 1,
      '2026-10-15': 1,
    }),
    today,
    monday,
  );
  assert.deepEqual(summary.dots, [
    'done',
    'done',
    'done',
    'done',
    'empty',
    'none',
    'none',
  ]);
  assert.equal(summary.met, false);
});

test('days before the start date and future weeks draw nothing', () => {
  const late = { ...walk, startDate: '2026-10-14' };
  const summary = weekSummary(late, {}, today, monday);
  assert.deepEqual(summary.dots.slice(0, 2), ['none', 'none']);
  const future = weekSummary(walk, {}, today, monday + 7);
  assert.ok(future.dots.every((dot) => dot === 'none'));
  assert.equal(future.label, '');
});

test('weekday schedules leave unscheduled days off', () => {
  const weekdays = {
    ...walk,
    goals: [
      {
        id: 'g1',
        from: '2026-01-05',
        rule: { kind: 'checked' },
        weekdays: [1, 2, 3, 4, 5],
      },
    ],
  };
  const week = monday - 7;
  const done = Object.fromEntries(
    [5, 6, 7, 8, 9].map((d) => [`walk:2026-10-0${d}`, 1]),
  );
  const summary = weekSummary(weekdays, done, today, week);
  assert.deepEqual(summary.dots.slice(5), ['off', 'off']);
  assert.equal(summary.met, true);
});

test('weekly quotas judge the whole week, never single days', () => {
  const quota = {
    ...walk,
    goals: [
      {
        id: 'g1',
        from: '2026-01-05',
        rule: { kind: 'checked' },
        weekdays: everyDay,
        period: {
          unit: 'week',
          days: 7,
          anchor: '2026-01-05',
          operator: 'atLeast',
          target: 3,
        },
      },
    ],
  };
  const partial = values('walk', { '2026-10-12': 1, '2026-10-13': 1 });
  const open = weekSummary(quota, partial, today, monday);
  assert.ok(!open.dots.includes('missed'));
  assert.equal(open.met, false);
  const reached = { ...partial, 'walk:2026-10-14': 1 };
  // At least: met as soon as the target is reached, even mid-week.
  assert.equal(weekSummary(quota, reached, today, monday).met, true);
});

test('numeric weeks show their total and tracking-only weeks never shade', () => {
  const water = {
    id: 'water',
    name: 'Water',
    color: '#82BCE6',
    type: 'number',
    unit: 'ml',
    startDate: '2026-01-05',
  };
  const summary = weekSummary(
    water,
    values('water', { '2026-10-05': 1500, '2026-10-06': 2250.5 }),
    today,
    monday - 7,
  );
  assert.equal(summary.label, '3751');
  assert.deepEqual(summary.dots.slice(0, 3), ['done', 'done', 'empty']);
  assert.equal(summary.met, false);
  assert.equal(weekSummary(water, {}, today, monday - 7).label, '');
});

test('week totals stay short', () => {
  assert.equal(compactTotal(0.1 + 0.2), '0.3');
  assert.equal(compactTotal(12.345), '12.3');
  assert.equal(compactTotal(1234.5), '1235');
  assert.equal(compactTotal(12500), '12.5k');
  assert.equal(compactTotal(1250000), '1.3M');
});
