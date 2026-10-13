import assert from 'node:assert/strict';
import test from 'node:test';
import { createSampleStore } from '../packages/core/src/dev/sampleData.ts';
import { evaluateGoal } from '../packages/core/src/habitGoals.ts';
import {
  dayNumber,
  dateKey,
  habitStatistics,
  habitTrackingStart,
} from '../packages/core/src/statistics.ts';
import { recordStatistics } from '../packages/core/src/recordStatistics.ts';
import { periodStatistics } from '../packages/core/src/periodStatistics.ts';
import {
  binSeries,
  habitSeries,
  niceMaximum,
  observations,
  statsWindow,
  streakRows,
  streakRuns,
  successMode,
  timeTicks,
  smoothedRates,
  weekStartOf,
} from '../packages/core/src/statsSeries.ts';
import { categoryColours } from '../packages/core/src/categoryColours.ts';
import { hexToOklch } from '../packages/core/src/colors.ts';

const today = '2026-10-10';
async function sample() {
  const store = await createSampleStore(today);
  const { replay, events } = store.getSnapshot();
  return { habits: replay.state.habits, values: replay.state.values, events };
}
function history(habit, values, events) {
  const start = habitTrackingStart(habit, values, events, today);
  return {
    start,
    series: habitSeries(
      habit,
      values,
      start,
      today,
      dayNumber(start),
      dayNumber(today),
    ),
  };
}

test('series outcomes match evaluateGoal for every sample habit and day', async () => {
  const { habits, values, events } = await sample();
  for (const habit of habits) {
    const { series } = history(habit, values, events);
    for (const item of series) {
      const goal = evaluateGoal(habit, item.value, item.date);
      const expected = !goal.active
        ? 'track'
        : !goal.scheduled
          ? 'off'
          : goal.met
            ? 'met'
            : item.date === today
              ? 'open'
              : 'missed';
      assert.equal(item.outcome, expected, `${habit.id} ${item.date}`);
    }
  }
});

test('streak runs end at the current streak and peak at the longest', async () => {
  const { habits, values, events } = await sample();
  for (const habit of habits) {
    const { start, series } = history(habit, values, events);
    const mode = successMode(series);
    const obs = observations(habit, series, mode, today);
    const runs = streakRuns(habit, series, mode, obs, today);
    let current, longest;
    if (mode === 'period') {
      const periods = periodStatistics(habit, values, start, today, start);
      current = periods.streak;
      longest = periods.bestStreak;
    } else if (habit.type === 'categorical' || habit.type === 'text') {
      const stats = recordStatistics(habit, values, events, today, 'all');
      current = mode === 'goal' ? stats.completion.streak : stats.streak;
      longest =
        mode === 'goal' ? stats.completion.bestStreak : stats.bestStreak;
    } else {
      const stats = habitStatistics(habit, values, events, today, 'all');
      current = stats.streak;
      longest = stats.bestStreak;
    }
    const ongoing = runs.filter((run) => run.ongoing);
    assert.ok(ongoing.length <= 1, `${habit.id} one ongoing run at most`);
    assert.equal(
      ongoing[0]?.length ?? 0,
      current,
      `${habit.id} current (${mode})`,
    );
    assert.equal(
      Math.max(0, ...runs.map((run) => run.length)),
      longest,
      `${habit.id} longest`,
    );
    for (const [index, run] of runs.entries()) {
      assert.ok(run.from <= run.to, `${habit.id} run spans forwards`);
      if (index)
        assert.ok(runs[index - 1].to < run.from, `${habit.id} ordered`);
    }
  }
});

test('period observations agree with the period goal results', async () => {
  const { habits, values, events } = await sample();
  const periodic = habits.filter((habit) =>
    habit.goals?.some((goal) => goal.period),
  );
  assert.ok(periodic.length, 'the sample includes a period goal');
  for (const habit of periodic) {
    const { start, series } = history(habit, values, events);
    const obs = observations(habit, series, 'period', today).filter(
      (item) => item.period,
    );
    const periods = periodStatistics(habit, values, start, today, start);
    assert.equal(obs.length, periods.eligible, habit.id);
    assert.equal(obs.filter((item) => item.met).length, periods.met, habit.id);
  }
});

test('the smoothed trend is unbiased, symmetric, gentle day to day and needs nearby data', () => {
  const steady = Array.from({ length: 60 }, (_, day) => ({
    day,
    met: true,
    from: day,
    period: false,
  }));
  assert.deepEqual(new Set(smoothedRates(steady, 0, 59)), new Set([1]));
  // Alternating success and misses: smoothing removes the daily zigzag.
  const alternating = steady.map((item) => ({
    ...item,
    met: item.day % 2 === 0,
  }));
  const rates = smoothedRates(alternating, 10, 30);
  for (let i = 1; i < rates.length; i++)
    assert.ok(Math.abs(rates[i] - rates[i - 1]) < 0.01, 'no zigzag');
  assert.ok(Math.abs(rates[10] - 0.5) < 0.01);
  // A single miss pulls the curve down symmetrically and gently.
  const dip = steady.map((item) => ({ ...item, met: item.day !== 30 }));
  const around = smoothedRates(dip, 24, 36);
  assert.ok(Math.abs(around[2] - around[10]) < 1e-9, 'symmetric');
  assert.ok(around[6] > 0.9, 'one miss is a gentle dip');
  assert.deepEqual(smoothedRates([], 0, 2), [null, null, null]);
  assert.deepEqual(
    smoothedRates([{ day: 0, met: true, from: 0, period: false }], 0, 1, 7, 2),
    [null, null],
    'one observation is not a trend',
  );
});

test('bins partition the window with calendar-day averages and goal counts', async () => {
  const { habits, values, events } = await sample();
  const read = habits.find((habit) => habit.id === 'read');
  const { start, series } = history(read, values, events);
  const window = series.filter((item) => item.day >= dayNumber(today) - 89);
  const stats = habitStatistics(read, values, events, today, 90);
  for (const unit of ['day', 'week', 'month']) {
    const bins = binSeries(read, window, unit, 'monday');
    assert.equal(
      bins.reduce((sum, bin) => sum + bin.days.length, 0),
      window.length,
    );
    assert.equal(
      bins.reduce((sum, bin) => sum + bin.total, 0),
      stats.total,
      unit,
    );
    assert.equal(
      bins.reduce((sum, bin) => sum + bin.eligible, 0),
      stats.eligible,
    );
    assert.equal(
      bins.reduce((sum, bin) => sum + bin.met, 0),
      stats.completion.successes,
    );
  }
  const weeks = binSeries(read, window, 'week', 'sunday');
  for (const bin of weeks.slice(1))
    assert.equal(weekStartOf(bin.from, 'sunday'), bin.from);
  assert.ok(start <= today);
});

test('windows step back by whole ranges and stop at the start', () => {
  assert.deepEqual(statsWindow(30, 0, '2026-01-01', today), {
    from: dayNumber(today) - 29,
    to: dayNumber(today),
    shown: dayNumber(today) - 29,
    canGoBack: true,
    canGoForward: false,
  });
  assert.equal(
    statsWindow(365, 0, '2026-04-14', today).shown,
    dayNumber('2026-04-14'),
    'charts start at the habit start',
  );
  const back = statsWindow(30, 2, '2026-01-01', today);
  assert.equal(dateKey(back.to), '2026-08-11');
  assert.equal(back.canGoForward, true);
  assert.equal(statsWindow(30, 0, '2026-09-20', today).canGoBack, false);
  assert.equal(
    statsWindow('all', 0, '2026-09-20', today).from,
    dayNumber('2026-09-20'),
  );
});

test('axis helpers choose readable ticks and round maxima', () => {
  const to = dayNumber(today);
  const weeks = timeTicks(to - 29, to, 'monday');
  assert.ok(weeks.length >= 4 && weeks.every((tick) => tick.kind === 'week'));
  assert.ok(timeTicks(to - 364, to, 'monday').every((t) => t.kind === 'month'));
  assert.ok(timeTicks(to - 1500, to, 'monday').every((t) => t.kind === 'year'));
  assert.deepEqual(
    [0, 0.7, 1, 3, 23, 60, 61, 9].map(niceMaximum),
    [1, 0.8, 1, 3, 25, 60, 80, 10],
  );
});

test('category colours are stable, distinct and readable on black', () => {
  const habit = {
    id: 'workout',
    name: 'Workout',
    color: '#8BC86F',
    type: 'categorical',
    categories: ['run', 'strength', 'stretch', 'rest', 'swim'].map((id) => ({
      id,
      label: id,
    })),
  };
  const colours = categoryColours(habit);
  assert.equal(colours.size, 5);
  assert.equal(new Set(colours.values()).size, 5);
  for (const colour of colours.values()) {
    assert.match(colour, /^#[0-9A-F]{6}$/);
    assert.ok(hexToOklch(colour).l > 0.68);
  }
  const extended = categoryColours({
    ...habit,
    categories: [...habit.categories, { id: 'yoga', label: 'Yoga' }],
  });
  for (const [id, colour] of colours) assert.equal(extended.get(id), colour);
});

test('streak rows: one row for a month, full month rows for a year, quarter rows beyond two years', () => {
  const to = dayNumber(today);
  const month = streakRows(to - 29, to);
  assert.equal(month.unit, 'window');
  assert.equal(month.rows.length, 1);
  assert.deepEqual(
    [month.rows[0].from, month.rows[0].to, month.rows[0].scale],
    [to - 29, to, 30],
  );
  const year = streakRows(to - 364, to);
  assert.equal(year.unit, 'month');
  assert.equal(year.rows.length, 13, 'Oct 2025 to Oct 2026');
  assert.deepEqual(
    year.rows.map((row) => row.year),
    [2025, 2025, 2025, ...Array(10).fill(2026)],
  );
  assert.ok(
    year.rows.every((row) => row.scale === 31 && !/\d/.test(row.label)),
  );
  assert.equal(year.rows[0].from, to - 364, 'the window starts mid-month');
  assert.equal(year.rows[0].start, dayNumber('2025-10-01'), 'the row does not');
  assert.equal(year.rows[0].days, 31);
  assert.equal(year.rows[4].days, 28, 'February 2026');
  assert.equal(year.rows.at(-1).to, to);
  for (let i = 1; i < year.rows.length; i++) {
    assert.equal(year.rows[i].from, year.rows[i - 1].to + 1, 'contiguous');
    assert.equal(
      year.rows[i].start,
      year.rows[i - 1].start + year.rows[i - 1].days,
    );
  }
  assert.equal(streakRows(to - 700, to).unit, 'month', 'two years of months');
  const long = streakRows(to - 900, to);
  assert.equal(long.unit, 'quarter');
  assert.ok(long.rows.every((row) => row.scale === 92));
  assert.match(long.rows[0].label, /^Q[1-4]$/);
  assert.equal(
    long.rows.reduce((sum, row) => sum + row.to - row.from + 1, 0),
    901,
    'every day appears once',
  );
});
