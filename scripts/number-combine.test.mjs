// How a number habit's days combine (v25 statsLayout): docs/STATISTICS.md.
import assert from 'node:assert/strict';
import test from 'node:test';
import { habitStatistics } from '../packages/core/src/statistics.ts';
import {
  binSeries,
  binValue,
  fittedRange,
  habitSeries,
  valueLevel,
} from '../packages/core/src/statsSeries.ts';
import {
  numberSummary,
  valueChartStyle,
  valueChartTitle,
} from '../packages/core/src/numberSummary.ts';

// Sleep from Monday 5 October to Sunday 11 October 2026, Wednesday blank.
const sleep = {
  id: 'sleep',
  name: 'Sleep',
  color: '#A6ACFF',
  type: 'number',
  unit: 'hours',
  startDate: '2026-10-05',
};
const values = {
  'sleep:2026-10-05': 8,
  'sleep:2026-10-06': 7.5,
  'sleep:2026-10-08': 9,
  'sleep:2026-10-09': 6,
  'sleep:2026-10-10': 8.5,
  'sleep:2026-10-11': 7,
};
const today = '2026-10-11';
const stats = (combine) =>
  habitStatistics(sleep, values, [], today, 'all', today, combine);

test('readings leave blank days out; totals count them as zero', () => {
  const total = stats('total');
  assert.equal(total.total, 46);
  assert.equal(total.recorded, 6);
  assert.equal(total.eligible, 7);
  assert.equal(total.average, 46 / 7);
  assert.equal(total.recordedAverage, 46 / 6);
  assert.equal(total.best, 9);
  assert.equal(total.lowest, 6);
  assert.equal(total.latest, 7);
  assert.equal(total.change, -1);
  const wednesday = (s) => s.weekday.find((item) => item.day === 3).value;
  // The blank Wednesday averages zero as a total, and has no reading.
  assert.equal(wednesday(total), 0);
  assert.equal(wednesday(stats('average')), null);
  const friday = (s) => s.weekday.find((item) => item.day === 5).value;
  assert.equal(friday(stats('average')), 6);
  assert.equal(friday(stats('highest')), 6);
});

test('negative readings keep their true highest', () => {
  const cold = { ...sleep, id: 'cold', unit: '°C' };
  const s = habitStatistics(
    cold,
    { 'cold:2026-10-10': -4, 'cold:2026-10-11': -2 },
    [],
    today,
    'all',
    today,
  );
  assert.equal(s.best, -2);
  assert.equal(s.lowest, -4);
});

test('week bins combine as chosen', () => {
  const days = habitSeries(sleep, values, '2026-10-05', today, 20731, 20737);
  const [week] = binSeries(sleep, days, 'week', 'monday');
  assert.equal(binValue(week, 'total'), 46 / 7);
  assert.equal(binValue(week, 'average'), 46 / 6);
  assert.equal(binValue(week, 'highest'), 9);
  assert.equal(binValue(week, 'lowest'), 6);
  const level = valueLevel(days, 'average');
  assert.equal(level(6), 0);
  assert.equal(level(9), 1);
  assert.equal(valueLevel(days, 'total')(4.5), 0.5);
});

test('fitted axes cover the values in two round steps', () => {
  assert.deepEqual(fittedRange([7.5, 9, 8]), { min: 7, max: 9 });
  assert.deepEqual(fittedRange([80.2, 82.4]), { min: 80, max: 84 });
  assert.deepEqual(fittedRange([5, 5]), { min: 4.5, max: 5.5 });
  assert.deepEqual(fittedRange([-3, 4]), { min: -5, max: 5 });
  assert.deepEqual(fittedRange([]), { min: 0, max: 1 });
});

test('the summary follows the combine choice', () => {
  const average = numberSummary(stats('average'), 'average', 'hours');
  assert.equal(average.headline, '7.7 hours');
  assert.match(average.note, /^Average · recorded on 6 of 7 days/);
  assert.deepEqual(
    average.tiles.map((tile) => tile.label),
    ['Change, first to last', 'Lowest', 'Highest'],
  );
  assert.equal(average.tiles[0].value, '−1 hours');
  const total = numberSummary(stats('total'), 'total', 'hours');
  assert.equal(total.headline, '46 hours');
  assert.deepEqual(
    total.tiles.map((tile) => tile.label),
    ['Average per day', 'Highest day'],
  );
  assert.equal(numberSummary(stats('lowest'), 'lowest', '').headline, '6');
  assert.equal(valueChartStyle('total'), 'bars');
  assert.equal(valueChartStyle('highest'), 'dots');
  assert.equal(valueChartTitle('average', 'week'), 'Average each week');
  assert.equal(valueChartTitle('total', 'day'), 'Daily totals');
});
