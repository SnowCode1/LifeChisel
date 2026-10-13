import test from 'node:test';
import assert from 'node:assert/strict';
import { weekDayOrder } from '../packages/core/src/displayPreferences.ts';
import { gridLayout } from '../src/gridLayout.ts';
import { autoNameWidth } from '../packages/core/src/gridSizing.ts';
import { monthDays } from '../packages/core/src/statistics.ts';

test('column widths fit whole dates and preserve name width across orientations and text sizes', () => {
  const sizes = [
    { columnWidth: 44, points: 44 },
    { columnWidth: 'auto', points: 48 },
    { columnWidth: 64, points: 64 },
  ];
  const sizing = (columnWidth) => ({
    nameWidth: 'auto',
    nameFactor: 1,
    columnWidth,
  });
  for (const width of [284, 339, 366, 404, 680, 716, 812]) {
    for (const scale of [1, 1.3, 2, 3]) {
      let previousDays = Infinity;
      for (const size of sizes) {
        const layout = gridLayout(width, scale, sizing(size.columnWidth));
        // Names keep the automatic width unless one whole day needs the room.
        assert.equal(
          layout.nameWidth,
          Math.max(
            0,
            Math.min(
              Math.round(autoNameWidth(width, Math.max(1, scale))),
              width - size.points * Math.max(1, scale),
            ),
          ),
        );
        assert.ok(Number.isInteger(layout.visibleDays));
        assert.ok(layout.visibleDays <= previousDays);
        assert.ok(
          layout.columnWidth >= Math.min(layout.dateWidth, size.points * scale),
        );
        assert.ok(
          Math.abs(
            layout.nameWidth + layout.columnWidth * layout.visibleDays - width,
          ) < 0.001,
        );
        previousDays = layout.visibleDays;
      }
    }
  }
  assert.deepEqual(
    sizes.map(
      (size) => gridLayout(366, 1, sizing(size.columnWidth)).visibleDays,
    ),
    [5, 4, 3],
  );
  for (const width of [0, 20, 100])
    for (const size of sizes) {
      const layout = gridLayout(width, 1, sizing(size.columnWidth));
      assert.ok(layout.columnWidth >= 0 && Number.isFinite(layout.columnWidth));
      assert.ok(layout.nameWidth >= 0 && layout.visibleDays >= 1);
    }
});
test('week start aligns every calendar date with its weekday without changing date keys', () => {
  for (const month of [
    '2024-02',
    '2026-02',
    '2026-03',
    '2026-10',
    '2026-11',
    '2027-01',
  ]) {
    const monday = monthDays(month);
    for (const start of ['monday', 'sunday']) {
      const calendar = monthDays(month, start);
      const order = weekDayOrder(start);
      assert.deepEqual(calendar.days, monday.days);
      assert.equal(new Set(order).size, 7);
      calendar.days.forEach((date, index) => {
        const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
        assert.equal(order[(index + calendar.padding) % 7], weekday);
      });
    }
  }
  assert.deepEqual(weekDayOrder('monday'), [1, 2, 3, 4, 5, 6, 0]);
  assert.deepEqual(weekDayOrder('sunday'), [0, 1, 2, 3, 4, 5, 6]);
});
