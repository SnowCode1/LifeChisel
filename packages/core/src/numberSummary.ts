// The headline, note, tiles and explanations of a number habit's statistics,
// following how its days combine (v25 statsLayout). Shared wording for both
// apps; streak tiles stay with each screen because they depend on layout.
import type { BinUnit } from './statsSeries.ts';
import type { habitStatistics } from './statistics.ts';
import type { NumberCombine } from './statsLayout.ts';
import { formatStatistic as format } from './statisticsFormatting.ts';

type Statistics = ReturnType<typeof habitStatistics>;
export type SummaryTile = { label: string; value: string };

const plural = (count: number, noun = 'day') =>
  `${count} ${count === 1 ? noun : `${noun}s`}`;

/** Bars from zero for totals; dots on a fitted axis for readings. */
export const valueChartStyle = (combine: NumberCombine) =>
  combine === 'total' ? 'bars' : 'dots';

export function numberSummary(
  stats: Statistics,
  combine: NumberCombine,
  unit: string,
) {
  const withUnit = (value: number | null) =>
    `${format(value)}${unit && value !== null ? ` ${unit}` : ''}`;
  const signed = (value: number | null) =>
    value === null
      ? '—'
      : `${value > 0 ? '+' : value < 0 ? '−' : ''}${withUnit(Math.abs(value))}`;
  const recorded = stats.recorded > 0;
  const headline = !recorded
    ? 'Nothing recorded'
    : withUnit(
        combine === 'total'
          ? stats.total
          : combine === 'average'
            ? stats.recordedAverage
            : combine === 'highest'
              ? stats.best
              : stats.lowest,
      );
  const recordedOn = `${stats.recorded} of ${plural(stats.eligible)}`;
  const note = !recorded
    ? 'Your records will appear here.'
    : combine === 'total'
      ? `Total · recorded on ${recordedOn}`
      : combine === 'average'
        ? `Average · recorded on ${recordedOn}`
        : `${combine === 'highest' ? 'Highest' : 'Lowest'} day · recorded on ${recordedOn}`;
  const tiles: SummaryTile[] = [];
  if (stats.completion.active || stats.completion.eligible > 0)
    tiles.push({
      label: stats.periodGoals.current
        ? 'Days meeting the daily condition'
        : 'Days meeting the goal',
      value: stats.completion.eligible
        ? `${stats.completion.successes} of ${stats.completion.eligible}`
        : '—',
    });
  const value = (figure: number | null) => withUnit(recorded ? figure : null);
  if (combine === 'total')
    tiles.push(
      { label: 'Average per day', value: withUnit(stats.average) },
      { label: 'Highest day', value: value(stats.best) },
    );
  else if (combine === 'average')
    tiles.push(
      { label: 'Change, first to last', value: signed(stats.change) },
      { label: 'Lowest', value: value(stats.lowest) },
      { label: 'Highest', value: value(stats.best) },
    );
  else
    tiles.push(
      { label: 'Average', value: value(stats.recordedAverage) },
      combine === 'highest'
        ? { label: 'Lowest', value: value(stats.lowest) }
        : { label: 'Highest', value: value(stats.best) },
    );
  return { headline, note, tiles };
}

/** The (i) text of the values chart. */
export function valueChartInfo(
  combine: NumberCombine,
  unit: BinUnit,
  goal: boolean,
) {
  const outcome = goal
    ? ' Bright marks met that day’s goal, faded ones missed it, and grey ones were on days off. The dashed line (or band) is the goal.'
    : ' Add a goal to colour days by success.';
  if (unit === 'day')
    return combine === 'total'
      ? `Each bar is one day’s total.${outcome}`
      : `Each dot is one day’s value; the axis fits the values rather than starting at zero.${outcome}`;
  return combine === 'total'
    ? `Each bar is the average per day for a ${unit}, counting blank days as zero, so it compares with the daily goal line.${goal ? ' Brighter bars met the goal on more of their scheduled days.' : ''}`
    : `Each dot is the ${combine === 'average' ? 'average of the recorded days' : `${combine} day`} in a ${unit}; blank days are left out.`;
}

/** The values chart's title for the window's bin unit. */
export const valueChartTitle = (combine: NumberCombine, unit: BinUnit) =>
  unit === 'day'
    ? combine === 'total'
      ? 'Daily totals'
      : 'Daily values'
    : combine === 'total'
      ? 'Average per day'
      : `${combine === 'average' ? 'Average' : combine === 'highest' ? 'Highest' : 'Lowest'} each ${unit}`;

/** The weekday section's (i) text for a number habit. */
export const weekdayInfo = (combine: NumberCombine, unit: string) =>
  combine === 'total'
    ? `Average ${unit || 'total'} per day for each weekday in the selected period. Blank days count as zero.`
    : `${combine === 'average' ? 'Average of the recorded days' : `${combine === 'highest' ? 'Highest' : 'Lowest'} recorded day`} for each weekday in the selected period. Blank days are left out.`;

/** The opening sentence of How statistics work for a number habit. */
export const numberRulesNote = (combine: NumberCombine) =>
  combine === 'total'
    ? 'Averages divide totals by calendar days since the start, including today and blank days. Blanks stay empty; zero is a recorded total.'
    : 'Each recorded day is a reading: averages, highs and lows use recorded days only, and blank days are left out. Zero is a recorded value.';
