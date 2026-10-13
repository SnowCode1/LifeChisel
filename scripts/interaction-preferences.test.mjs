import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gridRowHeight,
  isRowSpacing,
} from '../packages/core/src/rowSpacing.ts';

test('row heights retain touch targets, adapt to the screen and expand for larger text', () => {
  assert.deepEqual(
    [44, 'auto', 64].map((value) => gridRowHeight(value, 1, 874)),
    [44, 52, 64],
  );
  // Automatic rows follow the screen: 52 on a 874-point iPhone, 48 on an
  // 800-point Android phone, within 44–56.
  assert.equal(gridRowHeight('auto', 1, 800), 48);
  assert.equal(gridRowHeight('auto', 1, 600), 44);
  assert.equal(gridRowHeight('auto', 1, 1200), 56);
  for (const value of [44, 'auto', 64]) {
    assert.ok(gridRowHeight(value, 0.8, 874) >= 44);
    assert.ok(gridRowHeight(value, 2, 874) > gridRowHeight(value, 1, 874));
  }
  for (const value of ['compact', 'standard', 'roomy'])
    assert.ok(isRowSpacing(value));
  for (const value of [null, 52, '', 'tiny'])
    assert.equal(isRowSpacing(value), false);
});
