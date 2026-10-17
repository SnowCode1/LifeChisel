import assert from 'node:assert/strict';
import test from 'node:test';
import {
  todayCount,
  todayCountLabel,
  todayStatus,
} from '../packages/core/src/todaySummary.ts';

// 2026-10-17 is a Saturday.
const today = '2026-10-17';
const walk = {
  id: 'walk',
  name: 'Walk',
  color: '#82E6BC',
  startDate: '2026-01-05',
};
const weekdays = {
  ...walk,
  id: 'gym',
  goals: [
    {
      id: 'g1',
      from: '2026-01-05',
      rule: { kind: 'checked' },
      weekdays: [1, 2, 3, 4, 5],
    },
  ],
};
const steps = { ...walk, id: 'steps', type: 'number', unit: 'steps' };
const water = {
  ...steps,
  id: 'water',
  goals: [
    {
      id: 'g1',
      from: '2026-01-05',
      rule: { kind: 'number', operator: 'atLeast', target: 8 },
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    },
  ],
};

test('a habit is done when its goal is met, or recorded when tracking only', () => {
  assert.equal(todayStatus(walk, undefined, today), 'open');
  assert.equal(todayStatus(walk, 1, today), 'done');
  assert.equal(todayStatus(walk, 0, today), 'open');
  assert.equal(todayStatus(steps, undefined, today), 'open');
  assert.equal(todayStatus(steps, 0, today), 'done');
  assert.equal(todayStatus(water, 5, today), 'open');
  assert.equal(todayStatus(water, 8, today), 'done');
});

test('unscheduled days and days before the start are off', () => {
  assert.equal(todayStatus(weekdays, undefined, today), 'off');
  // Done anyway on a day off: done, not "not today".
  assert.equal(todayStatus(weekdays, 1, today), 'done');
  assert.equal(todayStatus(weekdays, undefined, '2026-10-16'), 'open');
  assert.equal(
    todayStatus({ ...walk, startDate: '2026-10-20' }, undefined, today),
    'off',
  );
});

test('the day count reads quietly', () => {
  const count = todayCount(
    [walk, weekdays, steps, water],
    { [`walk:${today}`]: 1, [`water:${today}`]: 9 },
    today,
  );
  assert.deepEqual(count, { done: 2, open: 1, off: 1 });
  assert.equal(todayCountLabel(count), '2 of 3 done · 1 not today');
  assert.equal(todayCountLabel({ done: 0, open: 0, off: 0 }), '');
  assert.equal(todayCountLabel({ done: 0, open: 0, off: 2 }), '2 not today');
});
