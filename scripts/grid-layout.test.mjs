import assert from 'node:assert/strict';
import test from 'node:test';
import { gridLayout } from '../src/gridLayout.ts';

test('portrait and landscape use whole columns with usable touch targets', () => {
  for (const width of [284, 324, 339, 366, 404, 680, 716, 812]) {
    const layout = gridLayout(width, 1);
    assert.ok(layout.columnWidth >= 48);
    assert.ok(Number.isInteger(layout.visibleDays));
    assert.ok(
      Math.abs(
        layout.nameWidth + layout.columnWidth * layout.visibleDays - width,
      ) < 0.001,
    );
    assert.ok(layout.nameWidth >= 120 && layout.nameWidth <= 200);
  }
  // A 402-point iPhone keeps its 146-point names; a 360-point Android phone's
  // 324-point grid now fits the same four days instead of three.
  assert.equal(gridLayout(366, 1).nameWidth, 146);
  assert.equal(gridLayout(366, 1).visibleDays, 4);
  assert.equal(gridLayout(324, 1).visibleDays, 4);
  assert.ok(gridLayout(716, 1).visibleDays > gridLayout(366, 1).visibleDays);
});

test('a pixel ratio makes every day column whole physical pixels and fills the width', () => {
  for (const ratio of [2, 2.625, 3]) {
    for (const width of [339, 366, 404, 716, 812]) {
      const layout = gridLayout(width, 1, undefined, ratio);
      const pixels = layout.columnWidth * ratio;
      assert.ok(Math.abs(pixels - Math.round(pixels)) < 1e-9);
      assert.ok(
        Math.abs(layout.dateWidth - layout.columnWidth * layout.visibleDays) <
          1e-9,
      );
      assert.ok(Math.abs(layout.nameWidth + layout.dateWidth - width) < 1e-9);
      const plain = gridLayout(width, 1);
      assert.equal(layout.visibleDays, plain.visibleDays);
      assert.ok(plain.columnWidth - layout.columnWidth < 1 / ratio);
    }
  }
});

test('large text trades date count for readable names and larger controls', () => {
  const regular = gridLayout(366, 1);
  for (const scale of [1.3, 1.5, 2, 3]) {
    const enlarged = gridLayout(366, scale);
    assert.ok(enlarged.visibleDays < regular.visibleDays);
    assert.ok(enlarged.columnWidth >= 48 * scale);
    assert.ok(enlarged.nameWidth >= regular.nameWidth);
  }
});

test('unmeasured and very narrow layouts have finite nonnegative sizes', () => {
  for (const width of [0, 20, 100]) {
    const layout = gridLayout(width, 1);
    assert.ok(layout.visibleDays >= 1);
    assert.ok(layout.nameWidth >= 0);
    assert.ok(Number.isFinite(layout.columnWidth));
    assert.equal(layout.nameWidth + layout.dateWidth, width);
  }
});
