import assert from 'node:assert/strict';
import test from 'node:test';
import { habitSummary } from '../packages/core/src/habitSummary.ts';

const checkbox = {
  id: 'walk',
  name: 'Walk',
  color: '#82E6BC',
  startDate: '2026-01-05',
};
const goal = (fields) => ({
  id: 'g1',
  from: '2026-01-05',
  rule: { kind: 'checked' },
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  ...fields,
});

test('plain checkboxes show their schedule; other types show their rule', () => {
  assert.equal(habitSummary(checkbox, {}, '2026-01-07'), 'Every day');
  assert.equal(
    habitSummary(
      { ...checkbox, goals: [goal({ weekdays: [1, 2, 3, 4, 5] })] },
      {},
      '2026-01-07',
    ),
    'Mon · Tue · Wed · Thu · Fri',
  );
  const minutes = { ...checkbox, id: 'read', type: 'number', unit: 'minutes' };
  assert.equal(habitSummary(minutes, {}, '2026-01-07'), 'Track only');
  const rule = { kind: 'number', operator: 'atLeast', target: 20 };
  assert.equal(
    habitSummary({ ...minutes, goals: [goal({ rule })] }, {}, '2026-01-07'),
    'At least 20 minutes',
  );
  assert.equal(
    habitSummary(
      { ...minutes, goals: [goal({ rule, weekdays: [1, 3, 5] })] },
      {},
      '2026-01-07',
    ),
    'At least 20 minutes · Mon · Wed · Fri',
  );
});

test('quota goals show progress in the open period, and the line follows goal dates', () => {
  const period = {
    unit: 'week',
    days: 7,
    anchor: '2026-01-05',
    operator: 'atLeast',
    target: 2,
  };
  const habit = {
    ...checkbox,
    goals: [goal({ period }), goal({ id: 'g2', from: '2026-02-02' })],
  };
  const values = { 'walk:2026-01-05': 1, 'walk:2026-01-06': 0 };
  assert.equal(habitSummary(habit, values, '2026-01-07'), '1 of 2 this week');
  assert.equal(habitSummary(habit, {}, '2026-01-12'), '0 of 2 this week');
  // From February the daily goal replaces the quota.
  assert.equal(habitSummary(habit, values, '2026-02-03'), 'Every day');
  const limit = {
    ...habit,
    goals: [goal({ period: { ...period, operator: 'atMost', target: 3 } })],
  };
  assert.equal(
    habitSummary(limit, values, '2026-01-07'),
    '1 of at most 3 this week',
  );
});
