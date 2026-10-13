import { Path, Rect } from 'react-native-svg';
import { ChartFrame, type ChartSlot } from './ChartFrame';
import type { WeekStart } from '@onpurpose/core/displayPreferences';
import { dateKey } from '@onpurpose/core/statistics';
import {
  statisticMonthLabel,
  statisticSpanLabel,
  statisticTickLabel,
} from '@onpurpose/core/statisticsFormatting';
import {
  timeTicks,
  type BinUnit,
  type Observation,
  type SeriesBin,
  type SuccessMode,
} from '@onpurpose/core/statsSeries';
import { useTheme } from './ThemeContext';

const percent = (rate: number) => `${Math.round(rate * 100)}%`;

/**
 * Success over time: faint columns are each week's (or month's) actual share,
 * and the line is the weighted trend, where recent days count most.
 */
export function SuccessChart({
  colour,
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
  bins: SeriesBin[];
  unit: BinUnit;
  observations: Observation[];
  /** One value per day from `from` to `to`. */
  trend: (number | null)[];
  mode: SuccessMode;
  periodNoun: string;
  from: number;
  to: number;
  today: string;
  weekStart: WeekStart;
}) {
  const theme = useTheme();
  const span = to - from + 1;
  const columns = bins.map((bin) => {
    const inside = observations.filter(
      (item) => item.day >= bin.from && item.day <= bin.to,
    );
    const met = inside.filter((item) => item.met).length;
    // The trend at the end of the column, or today for the open column.
    const lastTrend = trend
      .slice(0, bin.to - from + 1)
      .findLast((value) => value !== null);
    return {
      bin,
      met,
      count: inside.length,
      rate: inside.length ? met / inside.length : null,
      trend: lastTrend ?? null,
    };
  });
  const noun =
    mode === 'period' ? periodNoun : mode === 'recording' ? 'days' : 'days';
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
      name="Success over time chart"
      colour={colour}
      slots={slots}
      height={120}
      ticks={timeTicks(from, to, weekStart).map((tick) => ({
        x: (tick.day - from) / span,
        label: statisticTickLabel(dateKey(tick.day), tick.kind),
      }))}
      axis={[
        { y: 0, label: '100%' },
        { y: 0.5, label: '50%' },
        { y: 1, label: '0%' },
      ]}
      legend={`${mode === 'recording' ? 'Days recorded' : mode === 'period' ? 'Goal met' : 'Scheduled days met'} each ${unit} · line shows the trend`}
      draw={({ width, height, selected }) => {
        const points = trend.map((rate, index) =>
          rate === null
            ? null
            : {
                x: ((index + 0.5) / span) * width,
                y: height - rate * (height - 2) - 1,
              },
        );
        let path = '',
          open = false;
        for (const point of points) {
          if (!point) {
            open = false;
            continue;
          }
          path += `${open ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
          open = true;
        }
        return (
          <>
            {columns.map((column, index) => {
              if (column.rate === null) return null;
              const slot = slots[index],
                slotWidth = (slot.x1 - slot.x0) * width,
                gap = Math.min(2, slotWidth * 0.12),
                barHeight = Math.max(2, column.rate * (height - 2));
              return (
                <Rect
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
            {!!path && (
              <Path
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
