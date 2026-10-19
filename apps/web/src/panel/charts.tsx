import { useState } from 'react';
import { checkmarkColor } from '@onpurpose/core/colors';
import {
  weekDayOrder,
  type WeekStart,
} from '@onpurpose/core/displayPreferences';
import type { Habit } from '@onpurpose/core/habits';
import { dateKey } from '@onpurpose/core/statistics';
import {
  formatStatistic as format,
  statisticDayLabel,
  statisticMonthLabel,
  statisticSpanLabel,
  statisticTickLabel,
} from '@onpurpose/core/statisticsFormatting';
import {
  binSeries,
  binValue,
  fittedRange,
  niceMaximum,
  streakRows,
  timeTicks,
  valueUnit,
  weekdayOf,
  type BinUnit,
  type Observation,
  type SeriesBin,
  type SeriesDay,
  type StreakRun,
  type SuccessMode,
} from '@onpurpose/core/statsSeries';
import { levelFill, outcomeFill } from '@onpurpose/core/outcomeColours';
import type { TimeOfDayStatistics } from '@onpurpose/core/timeOfDay';
import type { Theme } from '@onpurpose/core/theme';
import { ChartFrame, type ChartSlot } from './ChartFrame.tsx';
import {
  numberCombineLabel,
  type NumberCombine,
} from '@onpurpose/core/statsLayout';
import {
  valueChartStyle,
  valueChartTitle,
} from '@onpurpose/core/numberSummary';

const percent = (rate: number) => `${Math.round(rate * 100)}%`;
const ticksFor = (from: number, to: number, weekStart: WeekStart) =>
  timeTicks(from, to, weekStart).map((tick) => ({
    x: (tick.day - from) / (to - from + 1),
    label: statisticTickLabel(dateKey(tick.day), tick.kind),
  }));

/** Success over time: each week's (or month's) share, and the smoothed trend. */
export function SuccessChart({
  colour,
  theme,
  bins,
  unit,
  observations,
  trend,
  mode,
  periodNoun,
  from,
  to,
  today,
  weekStart,
}: {
  colour: string;
  theme: Theme;
  bins: SeriesBin[];
  unit: BinUnit;
  observations: Observation[];
  trend: (number | null)[];
  mode: SuccessMode;
  periodNoun: string;
  from: number;
  to: number;
  today: string;
  weekStart: WeekStart;
}) {
  const span = to - from + 1;
  const columns = bins.map((bin) => {
    const inside = observations.filter(
      (item) => item.day >= bin.from && item.day <= bin.to,
    );
    const met = inside.filter((item) => item.met).length;
    const last = trend.slice(0, bin.to - from + 1).findLast((v) => v !== null);
    return {
      bin,
      met,
      count: inside.length,
      rate: inside.length ? met / inside.length : null,
      trend: last ?? null,
    };
  });
  const noun = mode === 'period' ? periodNoun : 'days';
  const slots: ChartSlot[] = columns.map((column) => {
    const start = dateKey(column.bin.from),
      end = dateKey(column.bin.to);
    return {
      key: start,
      x0: (column.bin.from - from) / span,
      x1: (column.bin.to + 1 - from) / span,
      title:
        unit === 'month'
          ? statisticMonthLabel(start)
          : statisticSpanLabel(start, end, today),
      value: [
        column.count
          ? `${column.met} of ${column.count} ${noun}${mode === 'recording' ? ' recorded' : ''} (${percent(column.rate!)})`
          : mode === 'period'
            ? `No finished ${periodNoun}`
            : mode === 'recording'
              ? 'No days yet'
              : 'No scheduled days',
        column.trend === null ? '' : `trend ${percent(column.trend)}`,
      ]
        .filter(Boolean)
        .join(' · '),
    };
  });
  return (
    <ChartFrame
      name="Success over time"
      slots={slots}
      height={120}
      ticks={ticksFor(from, to, weekStart)}
      axis={[
        { y: 0, label: '100%' },
        { y: 0.5, label: '50%' },
        { y: 1, label: '0%' },
      ]}
      legend={`${mode === 'recording' ? 'Days recorded' : mode === 'period' ? 'Goal met' : 'Scheduled days met'} each ${unit} · the line shows the trend`}
      draw={({ width, height, selected }) => {
        let path = '',
          open = false;
        trend.forEach((rate, index) => {
          if (rate === null) {
            open = false;
            return;
          }
          const x = ((index + 0.5) / span) * width,
            y = height - rate * (height - 2) - 1;
          path += `${open ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
          open = true;
        });
        return (
          <>
            {columns.map((column, index) => {
              if (column.rate === null) return null;
              const slot = slots[index],
                slotWidth = (slot.x1 - slot.x0) * width,
                gap = Math.min(2, slotWidth * 0.12),
                barHeight = Math.max(2, column.rate * (height - 2));
              return (
                <rect
                  key={column.bin.from}
                  x={slot.x0 * width + gap}
                  y={height - barHeight}
                  width={Math.max(1, slotWidth - gap * 2)}
                  height={barHeight}
                  rx={Math.min(3, slotWidth * 0.15)}
                  fill={theme.mix(colour, selected === index ? 0.42 : 0.24)}
                />
              );
            })}
            {path && (
              <path
                d={path}
                stroke={colour}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                fill="none"
              />
            )}
          </>
        );
      }}
    />
  );
}

const OUTCOME_TEXT: Record<string, string> = {
  met: 'goal met',
  missed: 'goal missed',
  open: 'goal not met yet',
  off: 'not scheduled',
};

/**
 * A number habit's values with the goal line. Totals are bars from zero
 * (daily, or the average per day of longer bins); readings (Average,
 * Highest, Lowest) are dots joined by a line on an axis fitted to them.
 */
export function ValueChart({
  habit,
  colour,
  theme,
  bins,
  unit,
  combine,
  from,
  to,
  today,
  weekStart,
}: {
  habit: Habit;
  colour: string;
  theme: Theme;
  bins: SeriesBin[];
  unit: BinUnit;
  combine: NumberCombine;
  from: number;
  to: number;
  today: string;
  weekStart: WeekStart;
}) {
  const label = habit.unit ?? '',
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
      rule?.kind === 'number' && bin.scheduled
        ? rule.operator === 'between'
          ? [rule.target, rule.upper!]
          : [rule.target]
        : [];
    const fill =
      unit === 'day'
        ? (outcomeFill(colour, last.outcome, theme) ?? colour)
        : bin.scheduled
          ? levelFill(colour, bin.met / bin.scheduled, theme)
          : colour;
    return { bin, value, targets, fill, last };
  });
  const shown = rows.flatMap((row) => [
    ...(row.value === null ? [] : [row.value]),
    ...row.targets,
  ]);
  const { min, max } = dots
    ? fittedRange(shown)
    : { min: 0, max: niceMaximum(Math.max(0, ...shown)) };
  const goal = rows.findLast((row) => row.targets.length)?.targets;
  const binWord =
    combine === 'total' ? 'per day' : numberCombineLabel(combine).toLowerCase();
  const slots: ChartSlot[] = rows.map(({ bin, value, last }) => {
    const start = dateKey(bin.from),
      end = dateKey(bin.to);
    const title =
      unit === 'day'
        ? statisticDayLabel(start, today)
        : unit === 'month'
          ? statisticMonthLabel(start)
          : statisticSpanLabel(start, end, today);
    const text =
      unit === 'day'
        ? value === null
          ? last.outcome === 'missed' || last.outcome === 'open'
            ? `No entry · ${OUTCOME_TEXT[last.outcome]}`
            : 'No entry'
          : [withUnit(value), OUTCOME_TEXT[last.outcome]]
              .filter(Boolean)
              .join(' · ')
        : value === null
          ? 'No entries'
          : [
              `${withUnit(value)} ${binWord}`,
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
  return (
    <ChartFrame
      name={valueChartTitle(combine, unit)}
      slots={slots}
      height={140}
      ticks={ticksFor(from, to, weekStart)}
      axis={[
        { y: 0, label: format(max) },
        { y: 0.5, label: format((min + max) / 2) },
        { y: 1, label: format(min) },
      ]}
      legend={
        goal
          ? `${dots ? 'Bright dots' : 'Bright bars'} met the goal · dashed line at ${goal.map(format).join('–')}${label ? ` ${label}` : ''}`
          : 'Add a goal to colour days by success'
      }
      draw={({ width, height, selected }) => {
        const y = (value: number) =>
          height - ((value - min) / (max - min)) * (height - 2) - 1;
        const centre = (index: number) =>
          ((slots[index].x0 + slots[index].x1) / 2) * width;
        let line = '';
        if (dots)
          rows.forEach((row, index) => {
            if (row.value === null) return;
            line += `${line ? 'L' : 'M'}${centre(index).toFixed(1)} ${y(row.value).toFixed(1)}`;
          });
        return (
          <>
            {line && (
              <path
                d={line}
                stroke={colour}
                strokeWidth={1.5}
                strokeLinejoin="round"
                fill="none"
                opacity={0.45}
              />
            )}
            {rows.map((row, index) => {
              if (row.value === null) return null;
              const slot = slots[index],
                slotWidth = (slot.x1 - slot.x0) * width;
              if (dots) {
                const radius = Math.max(2, Math.min(4, slotWidth * 0.32));
                return (
                  <circle
                    key={row.bin.from}
                    cx={centre(index)}
                    cy={y(row.value)}
                    r={selected === index ? radius + 1.5 : radius}
                    fill={row.fill}
                  />
                );
              }
              const gap = Math.min(2, slotWidth * 0.15),
                barHeight = Math.max(2, (row.value / max) * (height - 2));
              return (
                <rect
                  key={row.bin.from}
                  x={slot.x0 * width + gap}
                  y={height - barHeight}
                  width={Math.max(1, slotWidth - gap * 2)}
                  height={barHeight}
                  rx={Math.min(3, slotWidth * 0.2)}
                  fill={row.fill}
                  opacity={selected === null || selected === index ? 1 : 0.7}
                />
              );
            })}
            {goal?.map((target) => (
              <line
                key={target}
                x1={0}
                x2={width}
                y1={y(target)}
                y2={y(target)}
                stroke={colour}
                strokeWidth={1.5}
                strokeDasharray="5 4"
                opacity={0.8}
              />
            ))}
          </>
        );
      }}
    />
  );
}

/** A bar with independently rounded left and right ends. */
function barPath(
  x: number,
  y: number,
  w: number,
  h: number,
  left: number,
  right: number,
) {
  const b = y + h,
    e = x + w;
  return [
    `M${x + left} ${y}`,
    `H${e - right}`,
    right ? `A${right} ${right} 0 0 1 ${e} ${y + right}` : '',
    `V${b - right}`,
    right ? `A${right} ${right} 0 0 1 ${e - right} ${b}` : '',
    `H${x + left}`,
    left ? `A${left} ${left} 0 0 1 ${x} ${b - left}` : '',
    `V${y + left}`,
    left ? `A${left} ${left} 0 0 1 ${x + left} ${y}` : '',
    'Z',
  ].join('');
}

const STREAK_HEADING = 20;

/**
 * Streaks as a timeline, as on the phone: each bar spans the days a streak
 * lasted and gaps are breaks, so a 5-day and a 500-day streak read equally
 * well. Longer windows stack rows by month or quarter (with year headings
 * across years). A streak's length sits at its end; ends stay square where
 * it continues on another row or began before the period; the current
 * streak is bright and finished ones are faded. Below, the best streaks.
 */
export function StreakChart({
  colour,
  theme,
  runs,
  noun,
  from,
  to,
  today,
  weekStart,
}: {
  colour: string;
  theme: Theme;
  /** Every streak in the habit's history, oldest first. */
  runs: StreakRun[];
  /** Plural unit, e.g. "days" or "weeks". */
  noun: string;
  from: number;
  to: number;
  today: string;
  weekStart: WeekStart;
}) {
  const track = theme.ink(0x17);
  // Days of a first or last month that fall outside the selected period.
  const outside = theme.ink(0x0c);
  const span = to - from + 1;
  const { unit, rows } = streakRows(from, to);
  const bar = unit === 'window' ? 26 : 18,
    gap = 8;
  const headed = unit !== 'window' && rows[0].year !== rows.at(-1)!.year;
  const headings: { year: number; top: number }[] = [];
  const tops: number[] = [];
  let cursor = 2;
  rows.forEach((row, index) => {
    if (headed && (index === 0 || rows[index - 1].year !== row.year)) {
      headings.push({ year: row.year, top: cursor });
      cursor += STREAK_HEADING;
    }
    tops.push(cursor);
    cursor += bar + gap;
  });
  const height = cursor - gap + 2;
  const amount = (value: number) =>
    `${value} ${value === 1 ? noun.replace(/s$/, '') : noun}`;
  const dates = (run: StreakRun) =>
    statisticSpanLabel(dateKey(run.from), dateKey(run.to), today);
  type Segment = {
    run: StreakRun;
    row: number;
    from: number;
    to: number;
    last: boolean;
  };
  const segments: Segment[] = [];
  for (const run of runs) {
    if (run.to < from || run.from > to) continue;
    rows.forEach((row, index) => {
      const a = Math.max(run.from, row.from),
        b = Math.min(run.to, row.to);
      if (a <= b)
        segments.push({
          run,
          row: index,
          from: a,
          to: b,
          last: b === Math.min(run.to, to),
        });
    });
  }
  const x = (row: (typeof rows)[number], day: number) =>
    (day - row.start) / row.scale;
  const slots: ChartSlot[] = segments.map((segment) => ({
    key: `${segment.run.from}:${segment.row}`,
    x0: x(rows[segment.row], segment.from),
    x1: x(rows[segment.row], segment.to + 1),
    y0: tops[segment.row] / height,
    y1: (tops[segment.row] + bar) / height,
    title: dates(segment.run),
    value: `${amount(segment.run.length)}${segment.run.ongoing ? ' · ongoing' : ''}`,
  }));
  const ticks =
    unit === 'window'
      ? timeTicks(from, to, weekStart).map((tick) => ({
          x: (tick.day - from) / span,
          label: statisticTickLabel(dateKey(tick.day), tick.kind),
        }))
      : unit === 'month'
        ? [1, 8, 15, 22, 29].map((day) => ({
            x: (day - 1) / 31,
            label: String(day),
          }))
        : [];
  const best = [...runs]
    .sort((a, b) => b.length - a.length || b.to - a.to)
    .slice(0, 3);
  const longest = best[0]?.length ?? 0;
  const faded = theme.mix(colour, 0.72);
  return (
    <div className="streaks">
      <div className={unit === 'window' ? 'streak-chart' : 'streak-chart rows'}>
        {unit !== 'window' && (
          <div className="streak-labels" aria-hidden="true">
            {headings.map((heading) => (
              <span
                key={`year:${heading.year}`}
                className="year"
                style={{ top: heading.top, height: STREAK_HEADING }}
              >
                {heading.year}
              </span>
            ))}
            {rows.map((row, index) => (
              <span
                key={`label:${index}`}
                style={{ top: tops[index], height: bar }}
              >
                {row.label}
              </span>
            ))}
          </div>
        )}
        <ChartFrame
          name="Streak timeline"
          slots={slots}
          height={height}
          ticks={ticks}
          axis={[]}
          legend={
            segments.length
              ? `Each bar is a streak · gaps are breaks${unit === 'month' ? ' · a row per month' : unit === 'quarter' ? ' · a row per quarter' : ''}`
              : 'No streak in this period'
          }
          draw={({ width, selected }) => {
            const px = (row: (typeof rows)[number], day: number) =>
              x(row, day) * width;
            const chosen = selected === null ? null : segments[selected].run;
            const dim = (segment: Segment) =>
              chosen !== null && chosen !== segment.run ? 0.45 : 1;
            return (
              <>
                {rows.map((row, index) => (
                  <g key={`row:${index}`}>
                    <rect
                      x={0}
                      y={tops[index]}
                      width={width}
                      height={bar}
                      rx={bar / 3.5}
                      fill={outside}
                    />
                    <rect
                      x={px(row, row.from)}
                      y={tops[index]}
                      width={Math.max(
                        1,
                        px(row, row.to + 1) - px(row, row.from),
                      )}
                      height={bar}
                      rx={bar / 3.5}
                      fill={track}
                    />
                  </g>
                ))}
                {segments.map((segment) => {
                  const row = rows[segment.row],
                    x0 = px(row, segment.from),
                    x1 = px(row, segment.to + 1),
                    w = Math.max(2, x1 - x0 - 1.5),
                    r = Math.min(bar / 3.5, w / 2),
                    roundLeft = segment.from === segment.run.from,
                    roundRight = segment.to === segment.run.to;
                  return (
                    <path
                      key={`bar:${segment.run.from}:${segment.row}`}
                      d={barPath(
                        x0,
                        tops[segment.row],
                        roundRight ? w : x1 - x0,
                        bar,
                        roundLeft ? r : 0,
                        roundRight ? r : 0,
                      )}
                      fill={segment.run.ongoing ? colour : faded}
                      opacity={dim(segment)}
                    />
                  );
                })}
                {segments.map((segment) => {
                  const row = rows[segment.row],
                    label = String(segment.run.length),
                    w = px(row, segment.to + 1) - px(row, segment.from),
                    size = unit === 'window' ? 11 : 10;
                  return segment.last &&
                    w >= 10 + label.length * size * 0.62 ? (
                    <text
                      key={`label:${segment.run.from}`}
                      x={px(row, segment.to + 1) - 6}
                      y={tops[segment.row] + bar / 2 + size * 0.36}
                      fontSize={size}
                      fontWeight={700}
                      textAnchor="end"
                      fill={checkmarkColor(
                        segment.run.ongoing ? colour : faded,
                      )}
                      opacity={dim(segment)}
                    >
                      {label}
                    </text>
                  ) : null;
                })}
              </>
            );
          }}
        />
      </div>
      {best.length > 0 && (
        <div className="best-streaks">
          <h4>Best streaks</h4>
          {best.map((run) => (
            <div key={run.from} className="best-streak">
              <span className="best-track" aria-hidden="true">
                <span
                  style={{
                    width: `${(run.length / longest) * 100}%`,
                    backgroundColor: run.ongoing ? colour : faded,
                  }}
                />
              </span>
              <span className="best-length">{amount(run.length)}</span>
              <span className="best-dates">
                {dates(run)}
                {run.ongoing ? ' · ongoing' : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Success share or number for each weekday in the selected period. Totals
 * and shares are bars from zero; readings are dots on a fitted track, so
 * 8.3 and 8.8 hours look different.
 */
export function WeekdayBars({
  rows,
  colour,
  numeric,
  fitted = false,
  unit,
}: {
  rows: { day: number; label: string; value: number | null }[];
  colour: string;
  numeric: boolean;
  fitted?: boolean;
  unit: string;
}) {
  const shown = rows.flatMap((row) => (row.value === null ? [] : [row.value]));
  const { min, max } = fitted
    ? fittedRange(shown)
    : { min: 0, max: numeric ? Math.max(1, ...shown) : 100 };
  const position = (value: number) =>
    Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <ul className={fitted ? 'weekday-bars fitted' : 'weekday-bars'}>
      {rows.map((row) => (
        <li
          key={row.day}
          aria-label={`${row.label}, ${row.value === null ? 'no records' : `${format(row.value)}${numeric ? ` ${unit}` : '%'}`}`}
        >
          <span className="muted">{row.label}</span>
          <span className="track">
            {row.value !== null &&
              (fitted ? (
                <span
                  className="dot"
                  style={{
                    left: `${position(row.value)}%`,
                    backgroundColor: colour,
                  }}
                />
              ) : (
                <span
                  style={{
                    width: `${position(row.value)}%`,
                    backgroundColor: colour,
                  }}
                />
              ))}
          </span>
          <span className="value">
            {format(row.value)}
            {row.value !== null && !numeric ? '%' : ''}
          </span>
        </li>
      ))}
      {fitted && shown.length > 0 && (
        <li className="weekday-scale" aria-hidden="true">
          <span />
          <span className="muted">
            <span>{format(min)}</span>
            <span>{format(max)}</span>
          </span>
          <span />
        </li>
      )}
    </ul>
  );
}

/**
 * When entries were first made on their own day, as on the phone: days per
 * hour, with the busiest hour named above.
 */
export function TimeOfDayChart({
  stats,
  colour,
}: {
  stats: TimeOfDayStatistics;
  colour: string;
}) {
  const max = niceMaximum(Math.max(1, ...stats.hours));
  const slots: ChartSlot[] = stats.hours.map((count, hour) => ({
    key: String(hour),
    x0: hour / 24,
    x1: (hour + 1) / 24,
    title: hourRange(hour),
    value: `${count} ${count === 1 ? 'day' : 'days'}`,
  }));
  return (
    <ChartFrame
      name="Time of day chart"
      slots={slots}
      height={110}
      axis={[
        { y: 0, label: String(max) },
        { y: 1, label: '0' },
      ]}
      ticks={[0, 6, 12, 18].map((hour) => ({
        x: hour / 24,
        label: hourLabel(hour),
      }))}
      legend="Days per hour"
      draw={({ width, height, selected }) =>
        stats.hours.map((count, hour) => {
          if (!count) return null;
          const step = width / 24,
            barHeight = Math.max(2, (count / max) * (height - 2));
          return (
            <rect
              key={hour}
              x={hour * step + step * 0.16}
              y={height - barHeight}
              width={Math.max(1, step * 0.68)}
              height={barHeight}
              rx={Math.min(3, step * 0.2)}
              fill={colour}
              opacity={selected === null || selected === hour ? 0.9 : 0.4}
            />
          );
        })
      }
    />
  );
}
export const hourLabel = (hour: number) =>
  new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: 'numeric' });
export const hourRange = (hour: number) =>
  `${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}`;

/**
 * One row per category in saved order, as on the phone: when it was chosen
 * across the window (days, or weeks/months shaded by how often) or by
 * weekday. Several categories can share a day, so rows never stack into
 * misleading totals. Choosing a row filters the calendar and entries.
 */
export function CategoryMatrix({
  habit,
  days,
  colours,
  weekStart,
  theme,
  selected,
  onSelect,
}: {
  habit: Habit;
  days: SeriesDay[];
  colours: Map<string, string>;
  weekStart: WeekStart;
  theme: Theme;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [mode, setMode] = useState<'timeline' | 'weekday'>('timeline');
  const counted = days.filter(
    (item) => item.outcome !== 'future' && item.outcome !== 'outside',
  );
  const has = (item: SeriesDay, id: string) =>
    Array.isArray(item.value) && item.value.includes(id);
  const rows = (habit.categories ?? [])
    .map((category) => ({
      category,
      count: counted.filter((item) => has(item, category.id)).length,
    }))
    .filter((row) => !row.category.archived || row.count);
  const bins =
    mode === 'timeline'
      ? binSeries(habit, days, valueUnit(days.length), weekStart)
      : [];
  const order = weekDayOrder(weekStart);
  const columns = mode === 'timeline' ? bins.length : 7;
  // Single days are tall marks; weeks, months and weekdays are squares.
  const single = mode === 'timeline' && valueUnit(days.length) === 'day';
  return (
    <div className="category-matrix">
      <div className="segmented small" role="tablist" aria-label="Show">
        {(['timeline', 'weekday'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
          >
            {value === 'timeline' ? 'Over time' : 'By weekday'}
          </button>
        ))}
      </div>
      {mode === 'weekday' && (
        <div className="matrix-row matrix-head" aria-hidden="true">
          <span />
          <span
            className="matrix-cells"
            style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
          >
            {order.map((day) => (
              <span key={day}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'][day]}</span>
            ))}
          </span>
          <span />
        </div>
      )}
      {rows.map(({ category, count }) => {
        const colour = colours.get(category.id) ?? theme.colour(habit.color);
        const shares =
          mode === 'timeline'
            ? bins.map((bin) => {
                const eligible = bin.days.filter(
                  (item) =>
                    item.outcome !== 'future' && item.outcome !== 'outside',
                );
                return eligible.length
                  ? eligible.filter((item) => has(item, category.id)).length /
                      eligible.length
                  : null;
              })
            : order.map((day) => {
                const eligible = counted.filter(
                  (item) => weekdayOf(item.day) === day,
                );
                return eligible.length
                  ? eligible.filter((item) => has(item, category.id)).length /
                      eligible.length
                  : null;
              });
        return (
          <button
            key={category.id}
            type="button"
            className={
              selected && selected !== category.id
                ? 'matrix-row dimmed'
                : 'matrix-row'
            }
            aria-pressed={selected === category.id}
            aria-label={`${category.label}${category.archived ? ', archived' : ''}, ${count} ${count === 1 ? 'day' : 'days'}. ${selected === category.id ? 'Show all categories' : 'Show only this category in the calendar and entries'}`}
            onClick={() =>
              onSelect(selected === category.id ? null : category.id)
            }
          >
            <span className="matrix-label">
              <span
                className="matrix-swatch"
                style={{ backgroundColor: colour }}
              />
              <span className="matrix-name">{category.label}</span>
            </span>
            <span
              className={single ? 'matrix-cells single' : 'matrix-cells'}
              style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
              aria-hidden="true"
            >
              {shares.map((share, index) => (
                <span
                  key={index}
                  style={{
                    backgroundColor:
                      share === null
                        ? 'transparent'
                        : share > 0
                          ? theme.mix(colour, 0.35 + 0.65 * share)
                          : theme.ink(0x18),
                  }}
                />
              ))}
            </span>
            <span className="matrix-count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
