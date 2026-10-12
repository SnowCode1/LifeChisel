import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FUTURE_PULL_DISTANCE,
  FUTURE_BATCH,
  futureRevealDay,
} from '../src/gridNavigation.ts';
import { rightmostDayAt } from '../src/canvasGrid/gridGeometry.ts';

test('future reveal continues the pull distance instead of skipping a screen', () => {
  for (const columnWidth of [48, 55, 80, 120]) {
    const day = futureRevealDay(-FUTURE_PULL_DISTANCE, columnWidth, 0);
    assert.equal(day, -1, 'tomorrow lands beside the old edge');
    assert.equal(rightmostDayAt(day * columnWidth, columnWidth), -1);
  }
  assert.equal(futureRevealDay(-140, 55, 0), -3);
  assert.equal(futureRevealDay(-64, 55, 30), -31);
  assert.equal(futureRevealDay(-10000, 55, 30), -30 - FUTURE_BATCH);
});
