import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { appear } from './motion';
import { Text, useAppWindowDimensions } from './Typography';
import { Icon } from './Icon';
import type { StatsRange } from '@onpurpose/core/statistics';
import { themedStyles, useTheme } from './ThemeContext';

// Shared statistics building blocks. Both statistics screens use these so
// layout, spacing and explanations stay consistent; neither imports the other.

const RANGES: { value: StatsRange; label: string; spoken: string }[] = [
  { value: 30, label: '30 days', spoken: 'Last 30 days' },
  { value: 90, label: '90 days', spoken: 'Last 90 days' },
  { value: 365, label: 'Year', spoken: 'Last year' },
  { value: 'all', label: 'All time', spoken: 'All time' },
];

export function RangePicker({
  range,
  onChange,
}: {
  range: StatsRange;
  onChange: (range: StatsRange) => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const { fontScale } = useAppWindowDimensions();
  return (
    <View accessibilityRole="tablist" style={styles.ranges}>
      {RANGES.map((item) => {
        const selected = range === item.value;
        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityLabel={item.spoken}
            accessibilityState={{ selected }}
            aria-selected={selected}
            onPress={() => onChange(item.value)}
            style={[
              styles.range,
              // Two per row once larger text no longer fits four.
              { flexBasis: fontScale > 1.3 ? '46%' : '20%' },
              selected && { backgroundColor: theme.ink(0x2c) },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.rangeText, selected && { color: theme.ink(0xff) }]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function StepArrows({
  previousDisabled,
  nextDisabled,
  onChange,
  labels = ['Previous month', 'Next month'],
}: {
  previousDisabled: boolean;
  nextDisabled: boolean;
  onChange: (delta: -1 | 1) => void;
  labels?: [string, string];
}) {
  const theme = useTheme();
  const styles = useStyles();
  const statsStyles = useStatsStyles();
  return (
    <View style={styles.arrows}>
      {([-1, 1] as const).map((delta) => {
        const disabled = delta === -1 ? previousDisabled : nextDisabled;
        return (
          <Pressable
            key={delta}
            accessibilityRole="button"
            accessibilityLabel={delta === -1 ? labels[0] : labels[1]}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => onChange(delta)}
            style={({ pressed }) => [
              statsStyles.monthButton,
              { opacity: disabled ? 0.25 : pressed ? 0.5 : 1 },
            ]}
          >
            <View
              style={{
                transform: [{ rotate: delta === -1 ? '90deg' : '-90deg' }],
              }}
            >
              <Icon name="chevron" size={18} color={theme.ink(0xc8)} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The window's dates, with ‹ › to step back a whole range at a time. */
export function PeriodNavigator({
  label,
  canGoBack,
  canGoForward,
  onStep,
}: {
  label: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onStep: (delta: -1 | 1) => void;
}) {
  const styles = useStyles();
  const statsStyles = useStatsStyles();
  return (
    <View style={styles.periodRow}>
      <Text style={[statsStyles.period, { flex: 1 }]}>{label}</Text>
      {(canGoBack || canGoForward) && (
        <StepArrows
          previousDisabled={!canGoBack}
          nextDisabled={!canGoForward}
          onChange={onStep}
          labels={['Earlier period', 'Later period']}
        />
      )}
    </View>
  );
}

export type StatTile = { label: string; value: string; colour?: string };

/** Current and longest streak tiles, combined when that keeps the grid even. */
export function streakTiles(
  existing: number,
  label: string,
  current: number,
  longest: number,
): StatTile[] {
  const days = (count: number) => `${count} ${count === 1 ? 'day' : 'days'}`;
  return existing % 2 === 1
    ? [{ label: `${label} · longest ${days(longest)}`, value: days(current) }]
    : [
        { label, value: days(current) },
        {
          label: label.startsWith('Current')
            ? 'Longest streak'
            : `Longest · ${label.toLowerCase()}`,
          value: days(longest),
        },
      ];
}

export function StatTiles({ items }: { items: StatTile[] }) {
  const styles = useStyles();
  if (!items.length) return null;
  return (
    <View style={styles.tiles}>
      {items.map((item) => (
        <View
          key={item.label}
          accessible
          accessibilityLabel={`${item.label}, ${item.value}`}
          style={styles.tile}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.tileValue,
              item.colour ? { color: item.colour } : null,
            ]}
          >
            {item.value}
          </Text>
          <Text numberOfLines={2} style={styles.tileLabel}>
            {item.label}
          </Text>
        </View>
      ))}
      {/* Keep an odd final tile at half width instead of stretching it. */}
      {items.length % 2 === 1 && <View style={styles.spacer} />}
    </View>
  );
}

/**
 * A titled section. Explanations stay behind an info button so daily visits
 * show only the chart; `accessory` sits beside the title (for example month
 * arrows) and `subtitle` is one short line of live information.
 */
export function StatsSection({
  title,
  subtitle,
  info,
  accessory,
  children,
}: {
  title: string;
  subtitle?: string | null;
  info?: string;
  accessory?: ReactNode;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {accessory}
        {!!info && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`About ${title.toLowerCase()}`}
            accessibilityState={{ expanded }}
            onPress={() => setExpanded((value) => !value)}
            hitSlop={4}
            style={({ pressed }) => [
              styles.infoButton,
              { opacity: pressed ? 0.5 : 1 },
            ]}
          >
            <Icon
              name="info"
              size={18}
              color={expanded ? theme.ink(0xd0) : theme.ink(0x7a)}
            />
          </Pressable>
        )}
      </View>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {expanded && !!info && (
        <Animated.View entering={appear} style={styles.info}>
          <Text style={styles.infoText}>{info}</Text>
        </Animated.View>
      )}
      {children}
    </View>
  );
}

export const useStatsStyles = themedStyles((t) => ({
  body: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 22,
  },
  overview: { gap: 4 },
  period: { color: t.ink(0x8a), fontSize: 13, fontVariant: ['tabular-nums'] },
  headline: {
    color: t.ink(0xf0),
    fontSize: 30,
    fontWeight: '600',
    lineHeight: 38,
    fontVariant: ['tabular-nums'],
  },
  headlineNote: { color: t.ink(0x9a), fontSize: 14, lineHeight: 20 },
  caption: { color: t.ink(0x8e), fontSize: 13, lineHeight: 19 },
  small: {
    color: t.ink(0x85),
    fontSize: 12,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  track: { flex: 1, height: 5, borderRadius: 3, backgroundColor: t.ink(0x23) },
  monthButton: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

const useStyles = themedStyles((t) => ({
  ranges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    padding: 4,
    borderRadius: 13,
    backgroundColor: t.ink(0x15),
  },
  range: {
    flexGrow: 1,
    minHeight: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  rangeText: { color: t.ink(0x8f), fontSize: 14, fontWeight: '600' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: t.ink(0x12),
    justifyContent: 'center',
    gap: 3,
  },
  spacer: { flexGrow: 1, flexBasis: '45%' },
  tileValue: {
    color: t.ink(0xed),
    fontSize: 19,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  tileLabel: { color: t.ink(0x8c), fontSize: 12, lineHeight: 16 },
  section: {
    gap: 12,
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.ink(0x26),
  },
  arrows: { flexDirection: 'row' },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
    marginRight: -8,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  title: { flex: 1, color: t.ink(0xe2), fontSize: 17, fontWeight: '600' },
  subtitle: { color: t.ink(0x8e), fontSize: 13, lineHeight: 19, marginTop: -6 },
  infoButton: {
    width: 36,
    height: 36,
    marginRight: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: t.ink(0x12),
  },
  infoText: { color: t.ink(0xad), fontSize: 13, lineHeight: 19 },
}));
