import assert from 'node:assert/strict';
import test from 'node:test';
import {
  JOIN_MS,
  RETRACT_CURVE,
  RETRACT_MS,
  joinContactMs,
} from '../packages/core/src/tapMotion.ts';

const easeOutCubic = (t) => 1 - (1 - t) ** 3;
// A CSS cubic-bezier evaluated as browsers do: solve x for the time, read y.
function cssBezier([x1, y1, x2, y2], time) {
  const at = (a, b, s) =>
    3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 60; step++) {
    const middle = (low + high) / 2;
    if (at(x1, x2, middle) < time) low = middle;
    else high = middle;
  }
  return at(y1, y2, (low + high) / 2);
}

// The bar end is half a box from the reached box's centre at contact.
function barEnd(column, joining, ms) {
  return joining
    ? column * easeOutCubic(ms / JOIN_MS)
    : column * (1 - cssBezier(RETRACT_CURVE, ms / RETRACT_MS));
}

test('the retract curve is CSS ease-in-out', () => {
  assert.deepEqual(RETRACT_CURVE, [0.42, 0, 0.58, 1]);
});

test('a growing join touches the tapped box half a box from its centre', () => {
  const at = joinContactMs(26, 56, true);
  assert.ok(at > 0 && at < JOIN_MS);
  assert.ok(Math.abs(barEnd(56, true, at) - (56 - 13)) < 1e-9);
});

test('a retracting join touches the neighbour half a box from its centre', () => {
  const at = joinContactMs(26, 56, false);
  assert.ok(at > 0 && at < RETRACT_MS);
  assert.ok(Math.abs(barEnd(56, false, at) - 13) < 1e-6);
});

test('contact stays within the animation for any sizes', () => {
  assert.equal(joinContactMs(26, 0, true), 0);
  assert.equal(joinContactMs(26, Number.NaN, false), 0);
  // Boxes as wide as two columns touch at once.
  assert.equal(joinContactMs(120, 56, true), 0);
  assert.ok(joinContactMs(120, 56, false) < 1e-6);
  assert.equal(joinContactMs(0, 56, true), JOIN_MS);
  assert.ok(Math.abs(joinContactMs(0, 56, false) - RETRACT_MS) < 1e-6);
});
