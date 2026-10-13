import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from './Typography';
import { Icon } from './Icon';
import { periodSummary, periodMet } from '@onpurpose/core/goalTiming';
import type {
  periodStatistics,
  PeriodResult,
} from '@onpurpose/core/periodStatistics';
import { themedStyles, useTheme } from './ThemeContext';

export function PeriodProgress({
  data,
  colour,
}: {
  data: ReturnType<typeof periodStatistics>;
  colour: string;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);
  if (!data.current && !data.recent.length) return null;
  const label = (date: string, withYear = true) =>
    new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' as const } : {}),
    });
  const status = (row: PeriodResult) =>
    row.status === 'rest'
      ? 'Rest period'
      : row.status === 'partial'
        ? 'Partial period · not scored'
        : row.status === 'met'
          ? 'Goal met'
          : row.status === 'missed'
            ? 'Goal not met'
            : periodMet(row.period, row.count)
              ? row.period.operator === 'atLeast'
                ? 'Target reached'
                : 'Within limit so far'
              : row.period.operator !== 'atLeast' &&
                  row.count > (row.period.upper ?? row.period.target)
                ? 'Over limit'
                : 'In progress';
  return (
    <View style={styles.section}>
      {data.current && (
        <View style={{ gap: 4 }}>
          <View style={styles.headingRow}>
            <Text style={styles.heading}>
              {data.current.count} {data.current.count === 1 ? 'day' : 'days'}{' '}
              so far
            </Text>
            <Text style={[styles.status, { color: colour }]}>
              {status(data.current)}
            </Text>
          </View>
          <Text style={styles.note}>
            {periodSummary(data.current.period)} ·{' '}
            {label(
              data.current.start,
              data.current.start.slice(0, 4) !== data.current.end.slice(0, 4),
            )}{' '}
            – {label(data.current.end, false)}
          </Text>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Period results"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={styles.toggle}
      >
        <Text style={[styles.text, { flex: 1 }]}>
          {data.eligible
            ? `Goal met in ${data.met} of ${data.eligible} finished periods`
            : 'No finished periods yet'}
        </Text>
        <Icon name="chevron" color={theme.ink(0x99)} size={16} />
      </Pressable>
      {expanded && (
        <View style={{ gap: 14 }}>
          <Text style={styles.note}>
            Period streak {data.streak} · longest {data.bestStreak} (all time)
          </Text>
          {data.recent.map((row) => (
            <View key={row.id} style={{ gap: 3 }}>
              <Text style={styles.text}>
                {label(row.start)} – {label(row.end)}
              </Text>
              <Text style={styles.note}>
                {row.count} days · {status(row)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
const useStyles = themedStyles((t) => ({
  section: {
    gap: 6,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 2,
    borderRadius: 14,
    backgroundColor: t.ink(0x12),
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 10,
  },
  heading: { flex: 1, fontSize: 19, color: t.ink(0xed), fontWeight: '600' },
  status: { fontSize: 13, fontWeight: '600' },
  text: { fontSize: 14, color: t.ink(0xcc) },
  note: { fontSize: 12, color: t.ink(0x99) },
  toggle: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
}));
