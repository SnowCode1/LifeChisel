import { Circle, Line, Path, Rect } from 'react-native-svg';
import { ChartFrame, type ChartSlot } from './ChartFrame';
import type { WeekStart } from '@onpurpose/core/displayPreferences';
import type { Habit } from '@onpurpose/core/habits';
import { levelFill, outcomeFill } from '@onpurpose/core/outcomeColours';
import { dateKey } from '@onpurpose/core/statistics';
import {
  formatStatistic as format,
  statisticDayLabel,
  statisticMonthLabel,
  statisticSpanLabel,
  statisticTickLabel,
} from '@onpurpose/core/statisticsFormatting';
import {
  binValue,
  fittedRange,
  niceMaximum,
  timeTicks,
  type BinUnit,
  type SeriesBin,
} from '@onpurpose/core/statsSeries';
import { useTheme } from './ThemeContext';
import {
  numberCombineLabel,
  type NumberCombine,
} from '@onpurpose/core/statsLayout';
import {
  valueChartStyle,
  valueChartTitle,
} from '@onpurpose/core/numberSummary';

const OUTCOME_TEXT: Record<string, string> = {
  met: 'goal met',
  missed: 'goal missed',
  open: 'goal not met yet',
  off: 'not scheduled',
};

/**
 * Daily values with goal success encoded in colour (one chart instead of a
 * separate completion chart). Totals are bars from zero; longer ranges show
 * the average per calendar day of each week or month, brighter when more
 * scheduled days met the goal, so bars stay comparable with the daily goal
 * line. Readings (Average, Highest, Lowest; v25) are dots joined by a line on
 * an axis fitted to them, since a bar's length would claim a zero baseline.
 */
export function ValueChart({
  habit,
  bins,
  unit,
  combine,
  from,
  to,
  today,
  weekStart,
}: {
  habit: Habit;
  bins: SeriesBin[];
  unit: BinUnit;
  combine: NumberCombine;
  from: number;
  to: number;
  today: string;
  weekStart: WeekStart;
}) {
  const theme = useTheme();
  const colour = theme.colour(habit.color),
    label = habit.unit ?? '',
    span = to - from + 1,
    dots = valueChartStyle(combine) === 'dots';
  const withUnit = (value: number) =>
    `${format(value)}${label ? ` ${label}` : ''}`;
  const rows = bins.map((bin) => {
    const last = bin.days.at(-1)!,
      rule = last.goal?.rule;
    const value =
      unit === 'day'
        ? typeof last.value === 'number'
          ? last.value
          : null
        : binValue(bin, combine);
    const targets =
      rule?.kind === 'number' &&
      (unit === 'day' ? bin.scheduled : bin.scheduled)
        ? rule.operator === 'between'
          ? [rule.target, rule.upper!]
          : [rule.target]
        : [];
    const fill =
      unit === 'day'
        ? outcomeFill(colour, last.outcome, theme)
        : bin.scheduled
          ? levelFill(colour, bin.met / bin.scheduled, theme)
          : colour;
    return { bin, value, targets, fill };
  });
  const shown = rows.flatMap((row) => [
    ...(row.value === null ? [] : [row.value]),
    ...row.targets,
  ]);
  const { min, max: maximum } = dots
    ? fittedRange(shown)
    : { min: 0, max: niceMaximum(Math.max(0, ...shown)) };
  const goal = rows.findLast((row) => row.targets.length)?.targets;
  const slots: ChartSlot[] = rows.map(({ bin, value }) => {
    const start = dateKey(bin.from),
      end = dateKey(bin.to),
      last = bin.days.at(-1)!;
    const title =
      unit === 'day'
        ? statisticDayLabel(start, today)
        : unit === 'month'
          ? statisticMonthLabel(start)
          : statisticSpanLabel(start, end, today);
    let text: string;
    if (unit === 'day')
      text =
        value === null
          ? last.outcome === 'missed' || last.outcome === 'open'
            ? `No entry · ${OUTCOME_TEXT[last.outcome]}`
            : 'No entry'
          : [withUnit(value), OUTCOME_TEXT[last.outcome]]
              .filter(Boolean)
              .join(' · ');
    else
      text =
        value === null
          ? 'No entries'
          : [
              `${withUnit(value)} ${combine === 'total' ? 'per day' : numberCombineLabel(combine).toLowerCase()}`,
              bin.scheduled
                ? `goal met ${bin.met} of ${bin.scheduled} days`
                : '',
              combine === 'total'
                ? `total ${withUnit(bin.total)}`
                : `${bin.recorded} recorded`,
            ]
              .filter(Boolean)
              .join(' · ');
    return {
      key: start,
      x0: (bin.from - from) / span,
      x1: (bin.to + 1 - from) / span,
      title,
      value: text,
    };
  });
  // One continuous line per unchanged goal, so thin bars keep a dashed look.
  const goalRuns: { first: number; last: number; targets: number[] }[] = [];
  rows.forEach((row, index) => {
    const run = goalRuns.at(-1);
    if (!row.targets.length) return;
    if (
      run &&
      run.last === index - 1 &&
      run.targets.join() === row.targets.join()
    )
      run.last = index;
    else goalRuns.push({ first: index, last: index, targets: row.targets });
  });
  const y = (value: number, height: number) =>
    height - ((value - min) / (maximum - min)) * (height - 2);
  const centre = (index: number, width: number) =>
    ((slots[index].x0 + slots[index].x1) / 2) * width;
  return (
    <ChartFrame
      name={`${valueChartTitle(combine, unit)} chart`}
      colour={colour}
      slots={slots}
      ticks={timeTicks(from, to, weekStart).map((tick) => ({
        x: (tick.day - from) / span,
        label: statisticTickLabel(dateKey(tick.day), tick.kind),
      }))}
      axis={[
        { y: 0, label: format(maximum) },
        ...(goal
          ? [
              {
                y: 1 - (goal[0] - min) / (maximum - min),
                label: format(goal[0]),
              },
            ]
          : []),
        { y: 1, label: format(min) },
      ]}
      legend={
        unit === 'day'
          ? `${label ? label[0].toUpperCase() + label.slice(1) : 'Total'} per day`
          : combine === 'total'
            ? `Average ${label || 'total'} per day, by ${unit}`
            : `${numberCombineLabel(combine)} ${label || 'value'}, by ${unit}`
      }
      draw={({ width, height, selected }) => (
        <>
          {goalRuns.map((run) => {
            const x0 = slots[run.first].x0 * width,
              x1 = slots[run.last].x1 * width;
            return run.targets.length === 2 ? (
              <Rect
                key={`band:${run.first}`}
                x={x0}
                y={y(run.targets[1], height)}
                width={x1 - x0}
                height={Math.max(
                  1,
                  y(run.targets[0], height) - y(run.targets[1], height),
                )}
                fill={colour}
                opacity={0.1}
              />
            ) : (
              <Line
                key={`goal:${run.first}`}
                x1={x0}
                x2={x1}
                y1={y(run.targets[0], height)}
                y2={y(run.targets[0], height)}
                stroke={colour}
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.7}
              />
            );
          })}
          {dots && (
            <Path
              d={rows
                .map((row, index) =>
                  row.value === null
                    ? ''
                    : `${centre(index, width).toFixed(1)} ${y(row.value, height).toFixed(1)}`,
                )
                .filter(Boolean)
                .map((point, index) => `${index ? 'L' : 'M'}${point}`)
                .join('')}
              stroke={colour}
              strokeWidth={1.5}
              strokeLinejoin="round"
              fill="none"
              opacity={0.45}
            />
          )}
          {rows.map(({ bin, value, fill }, index) => {
            if (value === null || !fill) return null;
            if (dots) {
              const slotWidth = (slots[index].x1 - slots[index].x0) * width,
                radius = Math.max(2, Math.min(4, slotWidth * 0.32));
              return (
                <Circle
                  key={bin.from}
                  cx={centre(index, width)}
                  cy={y(value, height)}
                  r={selected === index ? radius + 1.5 : radius}
                  fill={fill}
                />
              );
            }
            const slot = slots[index],
              slotWidth = (slot.x1 - slot.x0) * width,
              gap = Math.min(2, slotWidth * 0.18),
              barHeight = Math.max(2, height - y(value, height));
            return (
              <Rect
                key={bin.from}
                x={slot.x0 * width + gap}
                y={height - barHeight}
                width={Math.max(1, slotWidth - gap * 2)}
                height={barHeight}
                rx={Math.min(2.5, slotWidth * 0.2)}
                fill={fill}
                opacity={selected === null || selected === index ? 1 : 0.55}
              />
            );
          })}
          {selected !== null && rows[selected].value === null && (
            <Rect
              x={slots[selected].x0 * width}
              y={height - 2}
              width={(slots[selected].x1 - slots[selected].x0) * width}
              height={2}
              fill={theme.mix(colour, 0.6)}
            />
          )}
        </>
      )}
    />
  );
}
