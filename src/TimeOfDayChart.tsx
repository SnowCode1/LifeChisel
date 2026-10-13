import { Rect } from 'react-native-svg';
import { ChartFrame, type ChartSlot } from './ChartFrame';
import { StatsSection } from './StatsLayout';
import { niceMaximum } from '@onpurpose/core/statsSeries';
import type { TimeOfDayStatistics } from '@onpurpose/core/timeOfDay';

const HEIGHT = 110;
const hourLabel = (hour: number) =>
  new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: 'numeric' });
const hourRange = (hour: number) =>
  `${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}`;
const days = (count: number) => `${count} ${count === 1 ? 'day' : 'days'}`;

// Shared by both statistics screens, including its section heading.
export function TimeOfDayChart({
  stats,
  colour,
}: {
  stats: TimeOfDayStatistics;
  colour: string;
}) {
  const max = niceMaximum(Math.max(1, ...stats.hours));
  const left = stats.recorded - stats.counted;
  const slots: ChartSlot[] = stats.hours.map((count, hour) => ({
    key: String(hour),
    x0: hour / 24,
    x1: (hour + 1) / 24,
    title: hourRange(hour),
    value: days(count),
  }));
  return (
    <StatsSection
      title="Time of day"
      subtitle={
        stats.peak !== null
          ? `Most often ${hourRange(stats.peak)}`
          : stats.recorded
            ? 'No same-day entries in this period'
            : 'Nothing recorded in this period'
      }
      info={`Each bar counts days by the hour their entry was first made, in the local time where it was made. Only entries made on the day they belong to count: this period has ${stats.counted} of ${days(stats.recorded)}${left ? `; ${left} added on a later day ${left === 1 ? 'is' : 'are'} left out` : ''}. Corrections keep the original time and undone changes never count. Tap a bar, or hold and drag along the chart, to read each hour.`}
    >
      {stats.counted > 0 && (
        <ChartFrame
          name="Time of day chart"
          colour={colour}
          slots={slots}
          height={HEIGHT}
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
                <Rect
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
      )}
    </StatsSection>
  );
}
