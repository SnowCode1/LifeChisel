import assert from 'node:assert/strict';
import test from 'node:test';
import {
  changedBefore,
  edgeScrollStep,
  fillAgoAt,
  fillIntent,
  planStroke,
  planTap,
} from '../src/grid/fillWave.ts';
import {
  fillStrokeAtMs,
  fillStrokeMs,
} from '../../../packages/core/src/tapMotion.ts';

test('a second press starts a fill only after the slop, mostly along the row', () => {
  assert.equal(fillIntent(3, 2, 6), null);
  assert.equal(fillIntent(-7, 3, 6), 'fill');
  assert.equal(fillIntent(4, 9, 6), 'none');
});

test('the pointer picks the column on the start row, clamped to loaded days', () => {
  // Start cell (5 days ago) spans x 100–140; Today is to the right.
  assert.equal(fillAgoAt(120, 100, 40, 5, 119), 5);
  assert.equal(fillAgoAt(141, 100, 40, 5, 119), 4);
  assert.equal(fillAgoAt(99, 100, 40, 5, 119), 6);
  assert.equal(fillAgoAt(5000, 100, 40, 5, 119), 0);
  assert.equal(fillAgoAt(-9000, 100, 40, 5, 119), 119);
});

test('drawing near an edge scrolls toward it, faster closer in', () => {
  assert.equal(edgeScrollStep(300, 100, 500), 0);
  assert.ok(edgeScrollStep(110, 100, 500) < 0);
  assert.ok(edgeScrollStep(495, 100, 500) > edgeScrollStep(470, 100, 500));
});

test('changedBefore reads single and multi-day changes', () => {
  assert.deepEqual(
    changedBefore({
      kind: 'entry',
      habitId: 'h',
      date: '2026-10-01',
      before: null,
      after: 1,
    }),
    { '2026-10-01': null },
  );
  assert.deepEqual(
    changedBefore({
      kind: 'entries',
      habitId: 'h',
      before: { '2026-10-01': null, '2026-10-02': 0 },
      after: { '2026-10-01': 1, '2026-10-02': 1 },
    }),
    { '2026-10-01': null, '2026-10-02': 0 },
  );
});

test('a tap joins to both checked neighbours at once', () => {
  const wave = planTap({
    col: 5,
    checked: true,
    isChecked: (col) => col === 4 || col === 5 || col === 6,
    columns: 10,
    contactMs: 120,
  });
  assert.deepEqual(
    wave.segments.map((item) => [item.anchor, item.target, item.grow]),
    [
      [4, 5, true],
      [6, 5, true],
    ],
  );
  assert.equal(wave.bumps.get(5), 120);
});

// Columns 2..5 drawn left to right (towards newer days).
const ticked = new Set([6]);
const run = {
  cols: [2, 3, 4, 5],
  columns: 10,
  reach: 0.25,
  contactMs: 100,
};

test('a ticking fill is one stroke: boxes fill as the bar reaches them', () => {
  const stroke = planStroke({
    ...run,
    checked: true,
    changed: () => true,
    wasChecked: (col) => ticked.has(col),
    isChecked: (col) => (col >= 2 && col <= 5) || ticked.has(col),
  });
  // Three steps through the run, then on into the ticked day beyond.
  assert.equal(stroke.length, 4);
  assert.equal(stroke.ms, fillStrokeMs(4));
  assert.equal(stroke.direction, 1);
  assert.equal(stroke.at.get(2), 0);
  assert.equal(stroke.at.get(3), fillStrokeAtMs(4, 0.75));
  // Strictly in drag order, ending with the day beyond's bump.
  const times = [3, 4, 5].map((col) => stroke.at.get(col));
  assert.deepEqual(
    [...times].sort((a, b) => a - b),
    times,
  );
  assert.ok(stroke.bumps.get(6) > stroke.at.get(5));
  // Each half follows the stroke: out of a cell, then into the next.
  assert.deepEqual(stroke.halves.get(2), [{ side: 'newer', start: 0 }]);
  assert.deepEqual(stroke.halves.get(3), [
    { side: 'older', start: 0.5 },
    { side: 'newer', start: 1 },
  ]);
  assert.deepEqual(stroke.halves.get(6), [{ side: 'older', start: 3.5 }]);
});

test('a clearing fill erases only joins that were there', () => {
  const was = new Set([3, 4, 5, 6]);
  const stroke = planStroke({
    ...run,
    checked: false,
    // The first click already cleared column 2.
    changed: (col) => col !== 2,
    wasChecked: (col) => was.has(col),
    isChecked: (col) => col === 6,
  });
  assert.equal(stroke.grow, false);
  assert.equal(stroke.length, 4);
  assert.equal(stroke.halves.get(2), undefined);
  assert.deepEqual(stroke.halves.get(3), [{ side: 'newer', start: 1 }]);
  assert.ok(stroke.bumps.has(6));
  assert.equal(stroke.segments.length, 0);
});

test("a press-and-drag moves the start cell's join with a ticked day behind", () => {
  const stroke = planStroke({
    ...run,
    cols: [5, 4, 3],
    checked: false,
    changed: () => true,
    wasChecked: (col) => col >= 3 && col <= 6,
    isChecked: (col) => col === 6,
  });
  assert.equal(stroke.direction, -1);
  assert.deepEqual(
    stroke.segments.map((item) => [item.anchor, item.target, item.grow]),
    [[6, 5, false]],
  );
  assert.equal(stroke.bumps.get(6), 100);
});

test('value fills only fade as the stroke passes', () => {
  const stroke = planStroke({
    ...run,
    checked: null,
    changed: () => true,
    wasChecked: () => false,
    isChecked: () => false,
  });
  assert.equal(stroke.halves.size, 0);
  assert.equal(stroke.bumps.size, 0);
  assert.equal(stroke.at.get(3), fillStrokeAtMs(3, 0.5));
});
