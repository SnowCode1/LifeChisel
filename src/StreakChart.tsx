import { View } from 'react-native';
import { Path, Rect, Text as SvgText } from 'react-native-svg';
import { Text } from './Typography';
import { ChartFrame, type ChartSlot } from './ChartFrame';
import { checkmarkColor } from '@onpurpose/core/colors';
import type { WeekStart } from '@onpurpose/core/displayPreferences';
import { dateKey } from '@onpurpose/core/statistics';
import {
  statisticSpanLabel,
  statisticTickLabel,
} from '@onpurpose/core/statisticsFormatting';
import {
  streakRows,
  timeTicks,
  type StreakRow as Row,
  type StreakRun,
} from '@onpurpose/core/statsSeries';
import { themedStyles, useTheme } from './ThemeContext';

const HEADING = 20;

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

/**
 * Streaks as a timeline: each bar spans the days a streak lasted and gaps are
 * breaks, so a 5-day and a 500-day streak read equally well. Longer windows
 * stack rows by month or quarter. Below it, the best streaks of all time.
 */
export function StreakChart({
  colour,
  runs,
  noun,
  from,
  to,
  today,
  weekStart,
}: {
  colour: string;
  /** Every streak in the habit's history, oldest first. */
  runs: StreakRun[];
  /** Plural unit, e.g. "days" or "weeks". */
  noun: string;
  from: number;
  to: number;
  today: string;
  weekStart: WeekStart;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const track = theme.ink(0x17);
  // Days of a first or last month that fall outside the selected period.
  const outside = theme.ink(0x0c);
  const span = to - from + 1;
  const { unit, rows } = streakRows(from, to);
  const bar = unit === 'window' ? 26 : 18,
    gap = 8;
  // Rows spanning several years get a year heading before each year's rows.
  const headed = unit !== 'window' && rows[0].year !== rows.at(-1)!.year;
  const headings: { year: number; top: number }[] = [];
  const tops: number[] = [];
  let cursor = 2;
  rows.forEach((row, index) => {
    if (headed && (index === 0 || rows[index - 1].year !== row.year)) {
      headings.push({ year: row.year, top: cursor });
      cursor += HEADING;
    }
    tops.push(cursor);
    cursor += bar + gap;
  });
  const height = cursor - gap + 2;
  const top = (row: number) => tops[row];
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
  const x = (row: Row, day: number) => (day - row.start) / row.scale;
  const slots: ChartSlot[] = segments.map((segment) => ({
    key: `${segment.run.from}`,
    x0: x(rows[segment.row], segment.from),
    x1: x(rows[segment.row], segment.to + 1),
    y0: top(segment.row) / height,
    y1: (top(segment.row) + bar) / height,
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
        : [0, 31, 61].map((day) => ({ x: day / 92, label: '' }));
  const best = [...runs]
    .sort((a, b) => b.length - a.length || b.to - a.to)
    .slice(0, 3);
  const longest = best[0]?.length ?? 0;
  const faded = theme.mix(colour, 0.72);
  return (
    <View style={{ gap: 14 }}>
      <ChartFrame
        name="Streak timeline"
        colour={colour}
        slots={slots}
        height={height}
        gridLines={false}
        // Month and quarter rows need their label column; a single row has
        // no labels, so it uses the full width.
        reserveAxis={unit !== 'window'}
        axis={
          unit === 'window'
            ? []
            : rows.map((row, index) => ({
                y: (top(index) + bar / 2) / height,
                label: row.label,
              }))
        }
        ticks={ticks}
        legend={
          segments.length
            ? `Each bar is a streak · gaps are breaks${unit === 'month' ? ' · a row per month' : unit === 'quarter' ? ' · a row per quarter' : ''}`
            : 'No streak in this period'
        }
        draw={({ width, selectedKey }) => {
          const px = (row: Row, day: number) => x(row, day) * width;
          return (
            <>
              {headings.map((heading) => (
                <SvgText
                  key={`year:${heading.year}`}
                  x={0}
                  y={heading.top + HEADING / 2 + 3}
                  fontSize={11}
                  fontWeight="700"
                  fill={theme.ink(0x9a)}
                >
                  {String(heading.year)}
                </SvgText>
              ))}
              {rows.map((row, index) => [
                // Every row spans the full width, so the rows form one clean
                // block; days outside the period (or month) stay darker.
                <Rect
                  key={`row:${index}`}
                  x={0}
                  y={top(index)}
                  width={width}
                  height={bar}
                  rx={bar / 3.5}
                  fill={outside}
                />,
                <Rect
                  key={`track:${index}`}
                  x={px(row, row.from)}
                  y={top(index)}
                  width={Math.max(1, px(row, row.to + 1) - px(row, row.from))}
                  height={bar}
                  rx={bar / 3.5}
                  fill={track}
                />,
              ])}
              {segments.map((segment) => {
                const row = rows[segment.row],
                  x0 = px(row, segment.from),
                  x1 = px(row, segment.to + 1),
                  w = Math.max(2, x1 - x0 - 1.5),
                  r = Math.min(bar / 3.5, w / 2),
                  y = top(segment.row),
                  fill = segment.run.ongoing ? colour : faded,
                  opacity =
                    selectedKey !== null &&
                    selectedKey !== `${segment.run.from}`
                      ? 0.45
                      : 1;
                // Round only the real start and end of the streak. Where it
                // continues on another row, or began before this period, the
                // end stays square. One shape, so dimming never doubles up.
                const roundLeft = segment.from === segment.run.from,
                  roundRight = segment.to === segment.run.to;
                return [
                  <Path
                    key={`bar:${segment.run.from}:${segment.row}`}
                    d={barPath(
                      x0,
                      y,
                      roundRight ? w : x1 - x0,
                      bar,
                      roundLeft ? r : 0,
                      roundRight ? r : 0,
                    )}
                    fill={fill}
                    opacity={opacity}
                  />,
                ];
              })}
              {segments.map((segment) => {
                const row = rows[segment.row],
                  label = String(segment.run.length),
                  w = px(row, segment.to + 1) - px(row, segment.from),
                  size = unit === 'window' ? 11 : 10;
                return segment.last && w >= 10 + label.length * size * 0.62 ? (
                  <SvgText
                    key={`label:${segment.run.from}`}
                    x={px(row, segment.to + 1) - 6}
                    y={top(segment.row) + bar / 2 + size * 0.36}
                    fontSize={size}
                    fontWeight="700"
                    textAnchor="end"
                    fill={checkmarkColor(segment.run.ongoing ? colour : faded)}
                    opacity={
                      selectedKey !== null &&
                      selectedKey !== `${segment.run.from}`
                        ? 0.45
                        : 1
                    }
                  >
                    {label}
                  </SvgText>
                ) : null;
              })}
            </>
          );
        }}
      />
      {best.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={styles.heading}>Best streaks</Text>
          {best.map((run) => (
            <View
              key={run.from}
              accessible
              accessibilityLabel={`${amount(run.length)}, ${dates(run)}${run.ongoing ? ', ongoing' : ''}`}
              style={styles.row}
            >
              <View style={styles.track}>
                <View
                  style={{
                    width: `${(run.length / longest) * 100}%`,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: run.ongoing ? colour : faded,
                  }}
                />
              </View>
              <Text style={styles.length}>{amount(run.length)}</Text>
              <Text numberOfLines={1} style={styles.dates}>
                {dates(run)}
                {run.ongoing ? ' · ongoing' : ''}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const useStyles = themedStyles((t) => ({
  heading: { color: t.ink(0x9a), fontSize: 12, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28 },
  track: {
    width: 64,
    height: 6,
    borderRadius: 3,
    backgroundColor: t.ink(0x1e),
  },
  length: {
    width: 74,
    color: t.ink(0xe0),
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  dates: { flex: 1, color: t.ink(0x8e), fontSize: 13 },
}));
