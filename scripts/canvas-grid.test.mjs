import test from 'node:test';
import assert from 'node:assert/strict';
import {
  civilFromDays,
  dateKeyOf,
  weekdayOf,
  shadedWeekOf,
} from '../src/canvasGrid/gridDates.ts';
import {
  columnX,
  dayAtX,
  visibleDayRange,
  rightmostDayAt,
  snapOffset,
  rubberBand,
  checkboxGeometry,
  headingHeight,
} from '../src/canvasGrid/gridGeometry.ts';
import {
  cellAccessibility,
  cellState,
} from '../src/canvasGrid/cellAccessibility.ts';
import { ordinal, timingDate } from '../src/goalTiming.ts';
import { isShadedWeek } from '../src/displayPreferences.ts';
import { allWeekdays } from '../src/habitGoals.ts';

test('UI-thread date arithmetic matches the Date-based helpers across centuries', () => {
  for (
    let day = ordinal('1899-12-25');
    day < ordinal('2300-03-05');
    day += 37
  ) {
    const key = timingDate(day);
    assert.equal(dateKeyOf(day), key);
    const [year, month, date] = civilFromDays(day);
    assert.equal(
      key,
      `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`,
    );
    assert.equal(weekdayOf(day), new Date(`${key}T12:00:00Z`).getUTCDay());
    for (const start of ['monday', 'sunday'])
      assert.equal(shadedWeekOf(day, start), isShadedWeek(key, start));
  }
  for (const key of ['2024-02-29', '2000-02-29', '2026-12-31', '2027-01-01'])
    assert.equal(dateKeyOf(ordinal(key)), key);
});

test('canvas columns place Today at the right edge and map touches back to days', () => {
  const width = 220,
    column = 55;
  assert.equal(columnX(0, width, 0, column), 165);
  assert.equal(columnX(3, width, 0, column), 0);
  assert.equal(
    columnX(-1, width, -55, column),
    165,
    'tomorrow after one reveal',
  );
  for (const offset of [0, 27.5, 55, 1000, -110])
    for (const day of [-2, 0, 1, 5, 20]) {
      const x = columnX(day, width, offset, column);
      assert.equal(dayAtX(x + 1, width, offset, column), day);
      assert.equal(dayAtX(x + column - 1, width, offset, column), day);
    }
  assert.deepEqual(visibleDayRange(width, 0, column), [0, 3]);
  assert.deepEqual(visibleDayRange(width, 27.5, column), [0, 4]);
  assert.deepEqual(visibleDayRange(width, -55, column), [-1, 2]);
  assert.equal(rightmostDayAt(110, column), 2);
  assert.equal(rightmostDayAt(-55, column), -1);
  assert.equal(snapOffset(80, column, 0, 1000), 55);
  assert.equal(snapOffset(-30, column, 0, 1000), 0, 'never past the boundary');
  assert.equal(snapOffset(2000, column, 0, 1000), 1000);
});

test('rubber band resists without limit and checkbox geometry fits small cells', () => {
  assert.equal(rubberBand(0, 220), 0);
  const steps = [20, 60, 120, 400, 4000].map((over) => rubberBand(over, 220));
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i] > steps[i - 1]);
  assert.ok(steps.at(-1) < 220);
  assert.ok(steps[0] < 20, 'resistance from the first point');
  const normal = checkboxGeometry(1, 52, 55);
  assert.equal(normal.size, 28);
  assert.equal(normal.box, 22);
  assert.equal(normal.radius, 6);
  assert.equal(checkboxGeometry(1.5, 40, 48).size, 24);
  assert.equal(checkboxGeometry(1, 10, 55).size, 0);
  assert.equal(headingHeight(1), 56);
  assert.ok(headingHeight(1.5) > 56);
});

test('cell state and screen-reader labels keep the native grid wording', () => {
  const check = { id: 'c', name: 'Walk', color: '#82E6BC' };
  const defaultOn = {
    ...check,
    goals: [
      {
        id: 'g',
        from: '2026-01-01',
        rule: { kind: 'checked' },
        weekdays: allWeekdays,
        defaultChecked: true,
      },
    ],
  };
  const minutes = {
    id: 'n',
    name: 'Read',
    color: '#BDA5FF',
    type: 'number',
    unit: 'minutes',
  };
  assert.deepEqual(cellState(check, undefined, '2026-10-05'), {
    kind: 'checkbox',
    checked: false,
    met: false,
    recorded: false,
    label: '',
  });
  assert.equal(cellState(check, 1, '2026-10-05').checked, true);
  assert.equal(cellState(defaultOn, undefined, '2026-10-05').checked, true);
  assert.equal(cellState(defaultOn, 0, '2026-10-05').checked, false);
  const number = cellState(minutes, 0, '2026-10-05');
  assert.equal(number.kind, 'number');
  assert.equal(number.recorded, true, 'explicit zero is recorded');
  assert.equal(number.label, '0');
  assert.equal(cellState(minutes, undefined, '2026-10-05').label, '—');
  const a11y = cellAccessibility(check, 1, '2026-10-05', 'Monday 5 October');
  assert.equal(a11y.role, 'checkbox');
  assert.equal(a11y.checked, true);
  assert.equal(a11y.label, 'Walk, Monday 5 October, goal met');
  assert.equal(
    cellAccessibility(minutes, 25, '2026-10-05', 'Monday 5 October').label,
    'Read, Monday 5 October, 25 minutes, tracking only',
  );
  assert.equal(
    cellAccessibility(minutes, undefined, '2026-10-05', 'Monday 5 October')
      .hint,
    'Edit this day’s total',
  );
});
