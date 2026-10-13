import { Line, Rect } from 'react-native-svg';
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
  niceMaximum,
  timeTicks,
  type BinUnit,
  type SeriesBin,
} from '@onpurpose/core/statsSeries';
import { useTheme } from './ThemeContext';

const OUTCOME_TEXT: Record<string, string> = {
  met: 'goal met',
  missed: 'goal missed',
  open: 'goal not met yet',
  off: 'not scheduled',
};

/**
 * Daily totals with goal success encoded in colour (one chart instead of a
 * separate completion chart). Longer ranges show the average per calendar day
 * of each week or month, brighter when more scheduled days met the goal, so
 * bars stay comparable with the daily goal line.
 */
export function ValueChart({
  habit,
  bins,
  unit,
  from,
  to,
  today,
  weekStart,
}: {
  habit: Habit;
  bins: SeriesBin[];
  unit: BinUnit;
  from: number;
  to: number;
  today: string;
  weekStart: WeekStart;
}) {
  const theme = useTheme();
  const colour = theme.colour(habit.color),
    label = habit.unit ?? '',
    span = to - from + 1;
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
        : bin.recorded && bin.eligible
          ? bin.total / bin.eligible
          : null;
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
  const maximum = niceMaximum(
    Math.max(0, ...rows.flatMap((row) => [row.value ?? 0, ...row.targets])),
  );
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
              `${withUnit(value)} per day`,
              bin.scheduled
                ? `goal met ${bin.met} of ${bin.scheduled} days`
                : '',
              `total ${withUnit(bin.total)}`,
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
    height - (value / maximum) * (height - 2);
  return (
    <ChartFrame
      name={unit === 'day' ? 'Daily totals chart' : 'Average per day chart'}
      colour={colour}
      slots={slots}
      ticks={timeTicks(from, to, weekStart).map((tick) => ({
        x: (tick.day - from) / span,
        label: statisticTickLabel(dateKey(tick.day), tick.kind),
      }))}
      axis={[
        { y: 0, label: format(maximum) },
        ...(goal ? [{ y: 1 - goal[0] / maximum, label: format(goal[0]) }] : []),
        { y: 1, label: '0' },
      ]}
      legend={
        unit === 'day'
          ? `${label ? label[0].toUpperCase() + label.slice(1) : 'Total'} per day`
          : `Average ${label || 'total'} per day, by ${unit}`
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
          {rows.map(({ bin, value, fill }, index) => {
            if (value === null || !fill) return null;
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
