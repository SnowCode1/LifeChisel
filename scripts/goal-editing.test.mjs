import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGoalAmount,
  goalDraftIssue,
} from '../packages/core/src/goalEditing.ts';
const habit = { id: 'read', name: 'Read', type: 'number', color: '#82E6BC' };
const goal = {
  id: 'goal',
  from: '2026-10-06',
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  rule: { kind: 'number', operator: 'atLeast', target: 0 },
};
test('goal amount drafts accept decimal keyboard input and reject empty or nonliteral numbers', () => {
  assert.equal(parseGoalAmount('.5'), 0.5);
  assert.equal(parseGoalAmount(',5'), 0.5);
  assert.equal(parseGoalAmount('1.'), 1);
  assert.equal(parseGoalAmount(' 0 '), 0);
  for (const value of ['', ' ', '-1', '1e3', 'Infinity', '1,2.3'])
    assert.equal(Number.isNaN(parseGoalAmount(value)), true);
});
test('goal drafts explain incomplete targets, invalid schedules and colliding effective dates before storage', () => {
  assert.equal(goalDraftIssue(habit, goal), null);
  assert.equal(
    goalDraftIssue(habit, { ...goal, rule: { ...goal.rule, target: NaN } }),
    'Enter a target.',
  );
  assert.equal(
    goalDraftIssue(habit, {
      ...goal,
      rule: { kind: 'number', operator: 'between', target: 5, upper: 4 },
    }),
    'The upper limit must be at least the lower limit.',
  );
  assert.equal(
    goalDraftIssue(habit, { ...goal, weekdays: [] }),
    'Choose at least one day of the week.',
  );
  assert.equal(
    goalDraftIssue(habit, { ...goal, from: '2026-02-30' }),
    'Choose a valid starting date.',
  );
  assert.match(
    goalDraftIssue({ ...habit, goals: [{ ...goal, id: 'previous' }] }, goal),
    /already starts/,
  );
  const categories = {
    ...habit,
    type: 'categorical',
    categories: [{ id: 'run', label: 'Run' }],
  };
  assert.equal(
    goalDraftIssue(categories, {
      ...goal,
      rule: { kind: 'categories', match: 'all', ids: [], exclude: [] },
    }),
    'Choose at least one category.',
  );
  const text = { ...habit, type: 'text' };
  assert.equal(
    goalDraftIssue(text, {
      ...goal,
      rule: { kind: 'text', match: 'any', terms: ['Walk', 'walk'] },
    }),
    'Each phrase should be different.',
  );
});
