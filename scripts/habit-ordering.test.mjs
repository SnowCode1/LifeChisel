import assert from 'node:assert/strict';
import test from 'node:test';
import { replayEvents } from '../packages/core/src/storage/model.ts';
import {
  moveHabit,
  fullHabitOrder,
  displayedHabitOrder,
  dragDestination,
  habitRowPositions,
} from '../packages/core/src/habitOrdering.ts';
test('reorder moves only the intended ID, clamps ends, and retains archived slots', () => {
  const ids = ['a', 'b', 'c'];
  assert.deepEqual(moveHabit(ids, 'b', 9), ['a', 'c', 'b']);
  assert.deepEqual(moveHabit(ids, 'c', -2), ['c', 'a', 'b']);
  assert.deepEqual(ids, ['a', 'b', 'c']);
  const habits = [
    { id: 'a' },
    { id: 'archived', archived: true },
    { id: 'b' },
    { id: 'c' },
  ];
  assert.deepEqual(fullHabitOrder(habits, ['c', 'a', 'b']), [
    'c',
    'archived',
    'a',
    'b',
  ]);
  assert.throws(() => fullHabitOrder(habits, ['a', 'a', 'c']));
  assert.throws(() => fullHabitOrder(habits, ['a', 'b']));
});
test('drag placement uses measured row centres and does not move a stationary row', () => {
  const ids = ['a', 'b', 'c'],
    heights = { a: 52, b: 80, c: 52 };
  assert.equal(dragDestination(ids, heights, 52, 26), 0);
  assert.equal(dragDestination(ids, heights, 52, 92), 1);
  assert.equal(dragDestination(ids, heights, 52, 158), 2);
  assert.equal(dragDestination(ids, heights, 52, -20), 0);
  assert.equal(dragDestination(ids, heights, 52, 400), 2);
});

test('preview and committed layouts share exact ID positions across variable-height swaps', () => {
  const ids = ['short', 'tall', 'last'];
  const heights = { short: 52, tall: 96 };
  const original = habitRowPositions(ids, heights, 60);
  assert.deepEqual(original, {
    tops: { short: 0, tall: 52, last: 148 },
    total: 208,
  });
  const preview = moveHabit(ids, 'tall', 2);
  const positions = habitRowPositions(preview, heights, 60);
  assert.deepEqual(ids, ['short', 'tall', 'last']); // Render order stays unchanged during preview.
  assert.deepEqual(positions, {
    tops: { short: 0, last: 52, tall: 112 },
    total: 208,
  });
  assert.deepEqual(habitRowPositions([...preview], heights, 60), positions); // No rebase at drop.
  assert.deepEqual(
    habitRowPositions(moveHabit(preview, 'tall', 1), heights, 60),
    original,
  );
});

test('row positions preserve content height and leave no gaps for every drag destination', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const heights = { a: 52, b: 87, c: 64, d: 120 };
  for (const id of ids)
    for (let target = 0; target < ids.length; target++) {
      const order = moveHabit(ids, id, target);
      const { tops, total } = habitRowPositions(order, heights, 52);
      assert.equal(total, 323);
      assert.equal(tops[order[0]], 0);
      order
        .slice(1)
        .forEach((next, index) =>
          assert.equal(tops[next], tops[order[index]] + heights[order[index]]),
        );
    }
  assert.deepEqual(habitRowPositions([], heights, 52), { tops: {}, total: 0 });
});

test('filtered reorder preserves hidden and archived slots and validates the displayed subset', () => {
  const habits = [
    { id: 'a' },
    { id: 'hidden' },
    { id: 'archived', archived: true },
    { id: 'b' },
    { id: 'c' },
  ];
  assert.deepEqual(displayedHabitOrder(habits, ['c', 'a', 'b']), [
    'c',
    'hidden',
    'archived',
    'a',
    'b',
  ]);
  assert.deepEqual(
    displayedHabitOrder(habits, []),
    habits.map((h) => h.id),
  );
  assert.deepEqual(
    displayedHabitOrder(habits, ['a']),
    habits.map((h) => h.id),
  );
  for (const ids of [['a', 'a'], ['archived'], ['unknown']])
    assert.throws(() => displayedHabitOrder(habits, ids));
  assert.deepEqual(
    displayedHabitOrder(habits, ['hidden', 'c', 'b', 'a']),
    fullHabitOrder(habits, ['hidden', 'c', 'b', 'a']),
  );
  assert.deepEqual(
    habits.map((h) => h.id),
    ['a', 'hidden', 'archived', 'b', 'c'],
  );
});

test('a filtered drop saves a full order event and Undo/Redo restores hidden and archived positions', () => {
  const habits = ['a', 'hidden', 'archived', 'b'].map((id) => ({
    id,
    name: id,
    color: '#82E6BC',
    ...(id === 'archived' ? { archived: true } : {}),
  }));
  const meta = (sequence) => ({
    version: 9,
    id: `filtered-${sequence}`,
    sequence,
    recordedAt: '2026-10-05T08:00:00.000Z',
    timeZone: 'UTC',
    utcOffsetMinutes: 0,
  });
  const before = habits.map((h) => h.id);
  const after = displayedHabitOrder(habits, ['b', 'a']);
  const events = [
    { ...meta(1), type: 'initialize', habits },
    {
      ...meta(2),
      type: 'change',
      groupId: 'filtered-2',
      change: { kind: 'order', before, after },
    },
    {
      ...meta(3),
      type: 'undo',
      targetId: 'filtered-2',
      change: { kind: 'order', before: after, after: before },
    },
    {
      ...meta(4),
      type: 'redo',
      targetId: 'filtered-3',
      change: { kind: 'order', before, after },
    },
  ];
  assert.deepEqual(
    replayEvents(events.slice(0, 2)).replay.state.habits.map((h) => h.id),
    ['b', 'hidden', 'archived', 'a'],
  );
  assert.deepEqual(
    replayEvents(events.slice(0, 3)).replay.state.habits.map((h) => h.id),
    before,
  );
  const redone = replayEvents(events).replay.state.habits;
  assert.deepEqual(
    redone.map((h) => h.id),
    after,
  );
  assert.equal(redone[2].archived, true);
});
