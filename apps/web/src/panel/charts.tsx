import type { WeekStart } from '@onpurpose/core/displayPreferences';
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
  niceMaximum,
  streakRows,
  timeTicks,
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

/** Daily totals (or the average per day of longer bins) with the goal line. */
export function ValueChart({
  habit,
  colour,
  theme,
  bins,
  unit,
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
  from: number;
  to: number;
  today: string;
  weekStart: WeekStart;
}) {
  const label = habit.unit ?? '',
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
  const maximum = niceMaximum(
    Math.max(0, ...rows.flatMap((row) => [row.value ?? 0, ...row.targets])),
  );
  const goal = rows.findLast((row) => row.targets.length)?.targets;
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
  return (
    <ChartFrame
      name={unit === 'day' ? 'Daily totals' : 'Average per day'}
      slots={slots}
      height={140}
      ticks={ticksFor(from, to, weekStart)}
      axis={[
        { y: 0, label: format(maximum) },
        { y: 0.5, label: format(maximum / 2) },
        { y: 1, label: '0' },
      ]}
      legend={
        goal
          ? `Bright bars met the goal · dashed line at ${goal.map(format).join('–')}${label ? ` ${label}` : ''}`
          : 'Add a goal to colour days by success'
      }
      draw={({ width, height, selected }) => (
        <>
          {rows.map((row, index) => {
            if (row.value === null) return null;
            const slot = slots[index],
              slotWidth = (slot.x1 - slot.x0) * width,
              gap = Math.min(2, slotWidth * 0.15),
              barHeight = Math.max(2, (row.value / maximum) * (height - 2));
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
          {goal?.map((target) => {
            const y = height - (target / maximum) * (height - 2) - 1;
            return (
              <line
                key={target}
                x1={0}
                x2={width}
                y1={y}
                y2={y}
                stroke={colour}
                strokeWidth={1.5}
                strokeDasharray="5 4"
                opacity={0.8}
              />
            );
          })}
        </>
      )}
    />
  );
}

/** Streaks as a timeline; longer windows stack rows by month or quarter. */
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
  runs: StreakRun[];
  noun: string;
  from: number;
  to: number;
  today: string;
  weekStart: WeekStart;
}) {
  const { unit, rows } = streakRows(from, to);
  const bar = unit === 'window' ? 22 : 14;
  const amount = (value: number) =>
    `${value} ${value === 1 ? noun.replace(/s$/, '') : noun}`;
  return (
    <div className="streak-rows">
      {rows.map((row) => {
        const segments = runs
          .filter((run) => run.to >= row.from && run.from <= row.to)
          .map((run) => ({
            run,
            from: Math.max(run.from, row.from),
            to: Math.min(run.to, row.to),
          }));
        const slots: ChartSlot[] = segments.map((segment) => ({
          key: `${segment.run.from}`,
          x0: (segment.from - row.start) / row.scale,
          x1: (segment.to + 1 - row.start) / row.scale,
          title: statisticSpanLabel(
            dateKey(segment.run.from),
            dateKey(segment.run.to),
            today,
          ),
          value: `${amount(segment.run.length)}${segment.run.ongoing ? ' · ongoing' : ''}`,
        }));
        return (
          <div key={row.start} className="streak-row">
            {unit !== 'window' && (
              <span className="streak-label">{row.label}</span>
            )}
            <ChartFrame
              name={`Streaks${row.label ? `, ${row.label} ${row.year}` : ''}`}
              slots={slots}
              height={bar}
              ticks={unit === 'window' ? ticksFor(from, to, weekStart) : []}
              axis={[]}
              legend={unit === 'window' ? 'Each bar is one streak' : ''}
              draw={({ width, height, selected }) => (
                <>
                  <rect
                    x={((row.from - row.start) / row.scale) * width}
                    y={0}
                    width={((row.to + 1 - row.from) / row.scale) * width}
                    height={height}
                    rx={height / 2}
                    fill={theme.ink(0x17)}
                  />
                  {slots.map((slot, index) => (
                    <rect
                      key={slot.key}
                      x={slot.x0 * width}
                      y={0}
                      width={Math.max(height, (slot.x1 - slot.x0) * width)}
                      height={height}
                      rx={height / 2}
                      fill={colour}
                      opacity={
                        selected === null || selected === index ? 1 : 0.75
                      }
                    />
                  ))}
                </>
              )}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Average or success share for each weekday in the selected period. */
export function WeekdayBars({
  rows,
  colour,
  numeric,
  unit,
}: {
  rows: { day: number; label: string; value: number | null }[];
  colour: string;
  numeric: boolean;
  unit: string;
}) {
  const maximum = numeric
    ? Math.max(1, ...rows.map((row) => row.value ?? 0))
    : 100;
  return (
    <ul className="weekday-bars">
      {rows.map((row) => (
        <li
          key={row.day}
          aria-label={`${row.label}, ${row.value === null ? 'no records' : `${format(row.value)}${numeric ? ` ${unit}` : '%'}`}`}
        >
          <span className="muted">{row.label}</span>
          <span className="track">
            <span
              style={{
                width: `${Math.max(0, ((row.value ?? 0) / maximum) * 100)}%`,
                backgroundColor: colour,
              }}
            />
          </span>
          <span className="value">
            {format(row.value)}
            {row.value !== null && !numeric ? '%' : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** When entries were first recorded on the same day, by local hour. */
export function TimeOfDayChart({
  stats,
  colour,
  theme,
}: {
  stats: TimeOfDayStatistics;
  colour: string;
  theme: Theme;
}) {
  const maximum = Math.max(1, ...stats.hours);
  const hour = (h: number) =>
    new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' });
  const slots: ChartSlot[] = stats.hours.map((count, h) => ({
    key: String(h),
    x0: h / 24,
    x1: (h + 1) / 24,
    title: `${hour(h)}–${hour((h + 1) % 24)}`,
    value: `${count} ${count === 1 ? 'entry' : 'entries'}`,
  }));
  return (
    <ChartFrame
      name="Time of day"
      slots={slots}
      height={70}
      ticks={[0, 6, 12, 18].map((h) => ({ x: h / 24, label: hour(h) }))}
      axis={[]}
      legend={
        stats.peak === null
          ? 'No same-day entry times yet'
          : `Most often around ${hour(stats.peak)} · ${stats.counted} of ${stats.recorded} entries timed`
      }
      draw={({ width, height, selected }) => (
        <>
          {stats.hours.map((count, h) => {
            const slotWidth = width / 24,
              barHeight = count
                ? Math.max(2, (count / maximum) * (height - 2))
                : 0;
            return (
              <rect
                key={h}
                x={h * slotWidth + 1}
                y={height - barHeight}
                width={Math.max(1, slotWidth - 2)}
                height={barHeight}
                rx={2}
                fill={selected === h ? colour : theme.mix(colour, 0.6)}
              />
            );
          })}
        </>
      )}
    />
  );
}

/** One row per category: days chosen in the period; click to filter. */
export function CategoryRows({
  habit,
  days,
  colours,
  selected,
  onSelect,
}: {
  habit: Habit;
  days: SeriesDay[];
  colours: Map<string, string>;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const options = (habit.categories ?? []).filter(
    (option) =>
      !option.archived ||
      days.some(
        (day) => Array.isArray(day.value) && day.value.includes(option.id),
      ),
  );
  const span = Math.max(1, days.length);
  return (
    <ul className="category-rows">
      {options.map((option) => {
        const chosen = days.filter(
          (day) => Array.isArray(day.value) && day.value.includes(option.id),
        );
        const colour = colours.get(option.id) ?? 'currentColor';
        return (
          <li key={option.id}>
            <button
              type="button"
              aria-pressed={selected === option.id}
              className={
                selected && selected !== option.id ? 'dimmed' : undefined
              }
              onClick={() =>
                onSelect(selected === option.id ? null : option.id)
              }
            >
              <span className="category-name" style={{ color: colour }}>
                {option.label}
                {option.archived && <span className="muted"> · archived</span>}
              </span>
              <svg
                className="category-marks"
                viewBox={`0 0 ${span} 10`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {chosen.map((day) => (
                  <rect
                    key={day.day}
                    x={days.indexOf(day)}
                    y={0}
                    width={Math.max(0.6, span / 120)}
                    height={10}
                    fill={colour}
                  />
                ))}
              </svg>
              <span className="value">{chosen.length}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
