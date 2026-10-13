import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isTextScale,
  roundTextScale,
  textSizeStyle,
  combinedTextScale,
} from '../packages/core/src/textSize.ts';
import { gridLayout } from '../src/gridLayout.ts';
import { gridRowHeight } from '../packages/core/src/rowSpacing.ts';

test('text size has bounded 5-percent steps and normalises slider floating point values', () => {
  for (let percent = 85; percent <= 150; percent += 5)
    assert.equal(isTextScale(percent / 100), true);
  for (const value of [
    0,
    0.8,
    1.51,
    2,
    1.123,
    NaN,
    Infinity,
    null,
    '1.2',
    undefined,
  ])
    assert.equal(isTextScale(value), false);
  assert.equal(roundTextScale(1.1500001), 1.15);
  assert.equal(roundTextScale(0), 0.85);
  assert.equal(roundTextScale(4), 1.5);
});
test('native sizes and line heights scale once while inline spans inherit their already scaled parent', () => {
  const style = { fontSize: 15, lineHeight: 20, color: '#ABCDEF' };
  assert.deepEqual(textSizeStyle(style, 1.5), {
    fontSize: 22.5,
    lineHeight: 30,
  });
  assert.deepEqual(style, { fontSize: 15, lineHeight: 20, color: '#ABCDEF' });
  assert.deepEqual(textSizeStyle({ fontWeight: 'bold' }, 1.5, true), {});
  assert.deepEqual(textSizeStyle({ fontSize: 12, lineHeight: 16 }, 1.5, true), {
    fontSize: 18,
    lineHeight: 24,
  });
  assert.deepEqual(textSizeStyle(undefined, 1.5), { fontSize: 21 });
  assert.equal(combinedTextScale(2, 1.5), 3);
});
test('app and system text sizes share adaptive grid geometry in portrait and landscape without shrinking hit targets', () => {
  for (const width of [284, 366, 716, 812]) {
    for (const app of [0.85, 1, 1.15, 1.3, 1.5]) {
      for (const system of [1, 1.3, 2]) {
        const scale = combinedTextScale(system, app);
        for (const size of [44, 'auto', 64]) {
          const layout = gridLayout(width, scale, {
            nameWidth: 'auto',
            nameFactor: 1,
            columnWidth: size,
          });
          assert.ok(
            Number.isInteger(layout.visibleDays) && layout.visibleDays >= 1,
          );
          assert.ok(layout.columnWidth >= Math.min(layout.dateWidth, 44));
          assert.equal(layout.nameWidth + layout.dateWidth, width);
          assert.ok(gridRowHeight(size, scale, 874) >= 44);
        }
      }
    }
  }
  assert.ok(gridLayout(366, 1.5).visibleDays < gridLayout(366, 1).visibleDays);
  assert.ok(gridRowHeight('auto', 1.5, 874) > gridRowHeight('auto', 1, 874));
});
