import assert from 'node:assert/strict';
import test from 'node:test';
import {
  habitIsComplete,
  completionMask,
  visibleHabitRows,
} from '../packages/core/src/habitCompletion.ts';
import { completedHabitsSelection } from '../packages/core/src/storage/selection.ts';
import { createSampleStore } from '../packages/core/src/dev/sampleData.ts';

const habits = [
  { id: 'a', name: 'Walk', color: '#82E6BC' },
  { id: 'b', name: 'Read', color: '#BDA5FF', type: 'number' },
  { id: 'c', name: 'Water', color: '#82E6BC', unit: 'glasses' },
  { id: 'd', name: 'Stretch', color: '#82E6BC', type: 'checkbox' },
];
test('completion counts checks, leaving numeric totals to future conditions', () => {
  for (const habit of [habits[0], habits[3]]) {
    assert.equal(habitIsComplete(habit, 1), true);
    for (const value of [undefined, 0, 30])
      assert.equal(habitIsComplete(habit, value), false);
  }
  for (const habit of [habits[1], habits[2]])
    for (const value of [undefined, 0, 1, 100])
      assert.equal(habitIsComplete(habit, value), false);
});
test('today filtering keeps manual order and originals available for Show completed and other dates', () => {
  const mask = completionMask(
    habits,
    {
      'a:2026-10-05': 1,
      'b:2026-10-05': 100,
      'c:2026-10-05': 0,
      'd:2026-10-04': 1,
    },
    '2026-10-05',
  );
  assert.equal(mask, '1000');
  assert.deepEqual(
    visibleHabitRows(habits, mask, true, false, 0).map((h) => h.id),
    ['b', 'c', 'd'],
  );
  assert.equal(visibleHabitRows(habits, mask, false, false, 0), habits);
  assert.equal(visibleHabitRows(habits, mask, true, true, 0), habits);
  for (const day of [-1, 1, 20])
    assert.equal(visibleHabitRows(habits, mask, true, false, day), habits);
  assert.deepEqual(visibleHabitRows([habits[0]], '1', true, false, 0), []);
  assert.equal(
    completionMask(habits, { 'a:2026-10-05': 1 }, '2026-10-06'),
    '0000',
  );
  assert.deepEqual(
    habits.map((h) => h.id),
    ['a', 'b', 'c', 'd'],
  );
});
test('completion subscriptions ignore save acknowledgements, preferences, numeric totals and unrelated days', async () => {
  const store = await createSampleStore('2026-10-05');
  const rows = store.getSnapshot().replay.state.habits;
  const selected = completedHabitsSelection(store, rows, '2026-10-05', true);
  const disabled = completedHabitsSelection(store, rows, '2026-10-05', false);
  let changed = 0,
    unrelated = 0;
  const stop = selected.subscribe(() => changed++);
  const stopDisabled = disabled.subscribe(() => unrelated++);
  function change(habitId, date, after) {
    const before =
      store.getSnapshot().replay.state.values[`${habitId}:${date}`] ?? null;
    assert.equal(
      store.change({ kind: 'entry', habitId, date, before, after }),
      true,
    );
  }
  change('walk', '2026-10-05', null);
  assert.equal(changed, 1);
  const beforeMask = selected.getSnapshot();
  change('read', '2026-10-05', 999);
  change('water', '2026-10-05', 0);
  change('walk', '2026-10-06', 1);
  assert.equal(
    store.change({ kind: 'hideCompleted', before: false, after: true }),
    true,
  );
  await store.flush();
  assert.equal(changed, 1);
  assert.equal(selected.getSnapshot(), beforeMask);
  assert.equal(unrelated, 0);
  change('walk', '2026-10-05', 1);
  assert.equal(changed, 2);
  assert.equal(store.undo(), true);
  assert.equal(changed, 3);
  assert.equal(store.redo(), true);
  assert.equal(changed, 4);
  await store.flush();
  assert.equal(changed, 4);
  stop();
  stopDisabled();
});
