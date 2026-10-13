import { PeriodProgress } from './PeriodProgress';
import { memo, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import { Icon } from './Icon';
import { entryLabel, type EntryValues } from '@onpurpose/core/entries';
import type { Habit } from '@onpurpose/core/habits';
import type { HistoryAction, StoredEvent } from '@onpurpose/core/storage/model';
import { entryMinutes, timeOfDayStatistics } from '@onpurpose/core/timeOfDay';
import { TimeOfDayChart } from './TimeOfDayChart';
import { entryDay, type EntryDay } from '@onpurpose/core/calendar';
import {
  dateKey,
  dayNumber,
  habitTrackingStart,
  type StatsRange,
} from '@onpurpose/core/statistics';
import { recordStatistics } from '@onpurpose/core/recordStatistics';
import {
  PeriodNavigator,
  RangePicker,
  StatTiles,
  StatsSection,
  streakTiles,
  useStatsStyles,
  type StatTile,
} from './StatsLayout';
import {
  statisticDateLabel,
  statisticMonthLabel,
  statisticSpanLabel,
} from '@onpurpose/core/statisticsFormatting';
import type { WeekStart } from '@onpurpose/core/displayPreferences';
import { InfoNote } from './InfoNote';
import { GoalSummary } from './GoalSummary';
import { useSheetScroll } from './SheetModal';
import {
  binSeries,
  habitSeries,
  observations,
  statsWindow,
  streakRuns,
  successMode,
  successUnit,
  smoothedRates,
  TREND_SIGMA_DAYS,
  TREND_MINIMUM_WEIGHT,
  type SeriesDay,
} from '@onpurpose/core/statsSeries';
import { SuccessChart } from './SuccessChart';
import { StreakChart } from './StreakChart';
import { StatsCalendar } from './StatsCalendar';
import { CategoryMatrix } from './CategoryMatrix';
import { categoryColours } from '@onpurpose/core/categoryColours';
import { themedStyles, useTheme } from './ThemeContext';

type JournalRow =
  | { kind: 'month'; key: string; label: string; count: number }
  | { kind: 'entry'; key: string; item: SeriesDay };

export const RecordStatsScreen = memo(function RecordStatsScreen({
  habit,
  values,
  events,
  actions,
  today,
  weekStart,
  editable,
  onCellPress,
  bottomInset,
  onGoalEdit,
}: {
  habit: Habit;
  values: EntryValues;
  events: StoredEvent[];
  actions: HistoryAction[];
  today: string;
  weekStart: WeekStart;
  editable: boolean;
  onCellPress: (habit: Habit, day: EntryDay) => void;
  bottomInset: number;
  onGoalEdit: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const statsStyles = useStatsStyles();
  const habitColour = theme.colour(habit.color);
  const [range, setRange] = useState<StatsRange>(30);
  const [offset, setOffset] = useState(0);
  const [category, setCategory] = useState<string | null>(null);
  const trackingStart = useMemo(
    () => habitTrackingStart(habit, values, events, today),
    [habit, values, events, today],
  );
  const window = statsWindow(range, offset, trackingStart, today);
  // Charts start at the habit's start when the window reaches further back.
  const from = window.shown,
    end = dateKey(window.to),
    span = window.to - from + 1;
  const stats = useMemo(
    () => recordStatistics(habit, values, events, today, range, end),
    [habit, values, events, today, range, end],
  );
  const history = useMemo(
    () =>
      habitSeries(
        habit,
        values,
        trackingStart,
        today,
        dayNumber(trackingStart),
        dayNumber(today),
      ),
    [habit, values, trackingStart, today],
  );
  const days = useMemo(
    () => habitSeries(habit, values, trackingStart, today, from, window.to),
    [habit, values, trackingStart, today, from, window.to],
  );
  const mode = successMode(history);
  const period = mode === 'period' ? history.at(-1)?.goal?.period : undefined;
  const observed = useMemo(
    () => observations(habit, history, mode, today),
    [habit, history, mode, today],
  );
  // Period goals are judged once per period, so smooth over ~2 periods.
  const trend = useMemo(
    () =>
      smoothedRates(
        observed,
        from,
        window.to,
        period ? period.days * 2 : TREND_SIGMA_DAYS,
        period ? 1 : TREND_MINIMUM_WEIGHT,
      ),
    [observed, from, window.to, period],
  );
  const runs = useMemo(
    () => streakRuns(habit, history, mode, observed, today),
    [habit, history, mode, observed, today],
  );
  const visibleRuns = runs.filter(
    (run) => run.to >= from && run.from <= window.to,
  );
  const timeOfDay = useMemo(
    () => timeOfDayStatistics(habit, values, actions, dateKey(from), end),
    [habit, values, actions, from, end],
  );
  const minutes = useMemo(() => entryMinutes(habit, actions), [habit, actions]);
  const colours = useMemo(() => categoryColours(habit, theme), [habit, theme]);
  const goalShown = stats.completion.active || stats.completion.eligible > 0;
  const plural = (count: number, noun = 'day') =>
    `${count} ${count === 1 ? noun : `${noun}s`}`;
  const periodNoun = period?.unit === 'week' ? 'weeks' : 'periods';
  const tiles: StatTile[] = [];
  // When the goal is simply "record something", recording numbers repeat
  // the goal numbers: show each fact once.
  const sameDays =
      stats.recorded === stats.completion.successes &&
      stats.eligible === stats.completion.eligible,
    sameStreaks =
      stats.streak === stats.completion.streak &&
      stats.bestStreak === stats.completion.bestStreak;
  if (goalShown && !sameDays)
    tiles.push({
      label: 'Days recorded',
      value: `${stats.recorded} of ${stats.eligible}`,
    });
  const goalStreaks = goalShown && !stats.periodGoals.current;
  if (goalStreaks)
    tiles.push(
      ...streakTiles(
        tiles.length + (sameStreaks ? 0 : 1),
        'Current streak',
        stats.completion.streak,
        stats.completion.bestStreak,
      ),
    );
  if (!goalStreaks || !sameStreaks)
    tiles.push(
      ...streakTiles(
        tiles.length,
        'Days recorded in a row',
        stats.streak,
        stats.bestStreak,
      ),
    );
  const trendNow = trend.findLast((value) => value !== null);
  const longestRun = visibleRuns.reduce<(typeof runs)[number] | null>(
    (best, run) => (!best || run.length >= best.length ? run : best),
    null,
  );
  const selectedLabel = habit.categories?.find(
    (option) => option.id === category,
  )?.label;
  // The journal: newest first, grouped by month, optionally one category.
  const journal = useMemo(() => {
    const rows: JournalRow[] = [];
    const entries = days
      .filter(
        (item) =>
          item.value !== undefined &&
          item.outcome !== 'future' &&
          item.outcome !== 'outside' &&
          (!category ||
            (Array.isArray(item.value) && item.value.includes(category))),
      )
      .reverse();
    let header: Extract<JournalRow, { kind: 'month' }> | null = null;
    for (const item of entries) {
      const month = item.date.slice(0, 7);
      if (!header || header.key !== month) {
        header = {
          kind: 'month',
          key: month,
          label: statisticMonthLabel(`${month}-01`),
          count: 0,
        };
        rows.push(header);
      }
      header.count++;
      rows.push({ kind: 'entry', key: item.date, item });
    }
    return rows;
  }, [days, category]);
  const changeRange = (next: StatsRange) => {
    setRange(next);
    setOffset(0);
  };
  const time = (minute: number) =>
    new Date(
      2000,
      0,
      1,
      Math.floor(minute / 60),
      minute % 60,
    ).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const header = (
    <View style={styles.header}>
      <RangePicker range={range} onChange={changeRange} />
      <View style={statsStyles.overview}>
        <PeriodNavigator
          label={
            stats.eligible
              ? statisticSpanLabel(dateKey(from), end, today)
              : `Starts ${statisticDateLabel(stats.trackingStart, true)}`
          }
          canGoBack={window.canGoBack}
          canGoForward={window.canGoForward}
          onStep={(delta) =>
            setOffset((previous) => Math.max(0, previous - delta))
          }
        />
        <Text style={statsStyles.headline}>
          {goalShown
            ? `${stats.completion.successes} of ${plural(stats.completion.eligible)}`
            : `${stats.recorded} of ${plural(stats.eligible)}`}
        </Text>
        <Text style={statsStyles.headlineNote}>
          {goalShown
            ? stats.periodGoals.current
              ? 'Meeting the daily condition'
              : 'Meeting the goal'
            : 'Recorded'}
        </Text>
      </View>
      <StatTiles items={tiles} />
      <GoalSummary
        compact
        habit={habit}
        date={today}
        onPress={onGoalEdit}
        disabled={!editable}
      />
      {offset === 0 && (
        <PeriodProgress data={stats.periodGoals} colour={habitColour} />
      )}
      {habit.type === 'categorical' && (
        <StatsSection
          title="Categories"
          subtitle={
            selectedLabel
              ? `Showing ${selectedLabel} · tap again for all`
              : null
          }
          info="Each row shows when that category was chosen; longer ranges shade each week or month by how often. Several categories can share a day, so rows are never added together. The number is days in this period. Tap a row to show only that category in the calendar and entries. Renamed and archived options keep their records."
        >
          <CategoryMatrix
            habit={habit}
            days={days}
            colours={colours}
            weekStart={weekStart}
            selected={category}
            onSelect={setCategory}
          />
        </StatsSection>
      )}
      <StatsSection
        title={mode === 'recording' ? 'Days recorded' : 'Success over time'}
        subtitle={
          trendNow === undefined || trendNow === null
            ? null
            : `Trend ${Math.round(trendNow * 100)}%${offset ? ` on ${statisticDateLabel(end)}` : ''}`
        }
        info={
          mode === 'period'
            ? `Columns show whether each finished period met its target. The line smooths success over about two ${periodNoun} either side; rest periods and the current period don’t count.`
            : mode === 'recording'
              ? 'Columns show the share of days with an entry. The line smooths that share over about two weeks either side, so single days don’t make it jump. Today counts once it’s recorded.'
              : 'Columns show the share of scheduled days that met the goal. The line smooths success over about two weeks either side, so single days don’t make it jump. Days off don’t count, and today counts once it’s done.'
        }
      >
        <SuccessChart
          key={`${habit.id}:${range}:${offset}`}
          colour={habitColour}
          bins={binSeries(habit, days, successUnit(span), weekStart)}
          unit={successUnit(span)}
          observations={observed}
          trend={trend}
          mode={mode}
          periodNoun={periodNoun}
          from={from}
          to={window.to}
          today={today}
          weekStart={weekStart}
        />
      </StatsSection>
      <StatsSection
        title="Streaks"
        subtitle={
          longestRun
            ? `Longest here: ${plural(longestRun.length, mode === 'period' ? periodNoun.replace(/s$/, '') : 'day')}, ${statisticSpanLabel(dateKey(longestRun.from), dateKey(longestRun.to), today)}`
            : 'No streak in this period'
        }
        info={
          mode === 'period'
            ? 'Each bar is a streak of finished periods in a row that met their target; rest periods hold it and a missed period breaks it. A bar cut off square at the left edge began earlier; square ends between rows mean the streak continues. Tap a bar for its length and dates.'
            : mode === 'recording'
              ? 'Each bar is a streak of days in a row with an entry; a day without one breaks it, and an unfinished today keeps it. A bar cut off square at the left edge began earlier; square ends between rows mean the streak continues. Tap a bar for its length and dates.'
              : 'Each bar is a streak of successful scheduled days in a row, carried across days off; a missed day breaks it, and an unfinished today keeps it. A bar cut off square at the left edge began earlier; square ends between rows mean the streak continues. Tap a bar for its length and dates.'
        }
      >
        <StreakChart
          key={`${habit.id}:${range}:${offset}`}
          colour={habitColour}
          runs={runs}
          noun={mode === 'period' ? periodNoun : 'days'}
          from={from}
          to={window.to}
          today={today}
          weekStart={weekStart}
        />
      </StatsSection>
      <StatsSection
        title="Calendar"
        info={
          habit.type === 'categorical'
            ? 'Tap a day to read or edit its entry. Dots show the categories chosen, in their colours. Days meeting their goal are brighter and join into one bar while the streak lasts.'
            : 'Tap a day to read or edit its entry. Days meeting their goal are brighter and join into one bar while the streak lasts.'
        }
      >
        <StatsCalendar
          key={`${habit.id}:${range}:${offset}`}
          habit={habit}
          days={days}
          from={from}
          to={window.to}
          today={today}
          weekStart={weekStart}
          editable={editable}
          allowFuture={offset === 0}
          onDayPress={onCellPress}
          categoryColours={colours}
          highlight={category}
        />
      </StatsSection>
      <TimeOfDayChart
        key={`${habit.id}:${range}:${offset}`}
        stats={timeOfDay}
        colour={habitColour}
      />
      <StatsSection
        title="Entries"
        subtitle={
          journal.length
            ? selectedLabel
              ? `Days with ${selectedLabel}, newest first`
              : 'Newest first'
            : null
        }
        accessory={
          selectedLabel ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Show all entries, not only ${selectedLabel}`}
              onPress={() => setCategory(null)}
              style={({ pressed }) => [
                styles.filter,
                {
                  backgroundColor: theme.mix(
                    colours.get(category!) ?? habitColour,
                    0.2,
                  ),
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  { color: colours.get(category!) ?? habitColour },
                ]}
              >
                {selectedLabel}
              </Text>
              <Icon name="close" size={13} color={theme.ink(0xbb)} />
            </Pressable>
          ) : undefined
        }
      />
    </View>
  );
  const sheetScroll = useSheetScroll();
  return (
    <FlatList<JournalRow>
      {...sheetScroll}
      testID="habit-statistics"
      data={journal}
      keyExtractor={(row) => `${row.kind}:${row.key}`}
      directionalLockEnabled
      alwaysBounceVertical
      contentInsetAdjustmentBehavior="never"
      initialNumToRender={12}
      maxToRenderPerBatch={8}
      windowSize={7}
      contentContainerStyle={[styles.body, { paddingBottom: bottomInset }]}
      ListHeaderComponent={header}
      renderItem={({ item: row }) => {
        if (row.kind === 'month')
          return (
            <Text accessibilityRole="header" style={styles.month}>
              {row.label} · {row.count} {row.count === 1 ? 'entry' : 'entries'}
            </Text>
          );
        const { item } = row,
          minute = minutes.get(item.date),
          date = new Date(`${item.date}T12:00:00`),
          met = item.outcome === 'met',
          // "Record anything" goals are met by every entry: no need to say so.
          scheduled =
            item.goal?.rule.kind !== 'recorded' &&
            (met || item.outcome === 'missed' || item.outcome === 'open');
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${entryDay(item.date).fullLabel}${minute === undefined ? '' : `, entered ${time(minute)}`}, ${entryLabel(habit, item.value)}${scheduled ? (met ? ', goal met' : ', goal not met') : ''}`}
            accessibilityHint="Edit this day's entry"
            accessibilityState={{ disabled: !editable }}
            disabled={!editable}
            onPress={() => onCellPress(habit, entryDay(item.date))}
            style={({ pressed }) => [
              styles.entry,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <View style={styles.when}>
              <Text style={styles.dayNumber}>{date.getDate()}</Text>
              <Text style={styles.weekday}>
                {date.toLocaleDateString(undefined, { weekday: 'short' })}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              {Array.isArray(item.value) ? (
                <View style={styles.chips}>
                  {item.value.map((id) => {
                    const colour = colours.get(id) ?? habitColour;
                    const label =
                      habit.categories?.find((option) => option.id === id)
                        ?.label ?? id;
                    return (
                      <View
                        key={id}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: theme.mix(colour, 0.18),
                            opacity: !category || category === id ? 1 : 0.45,
                          },
                        ]}
                      >
                        <Text style={[styles.chipText, { color: colour }]}>
                          {label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text numberOfLines={4} style={styles.entryText}>
                  {entryLabel(habit, item.value)}
                </Text>
              )}
              {(minute !== undefined || scheduled) && (
                <View style={styles.meta}>
                  {scheduled && (
                    <View
                      style={[
                        styles.goalDot,
                        met
                          ? { backgroundColor: habitColour }
                          : { borderWidth: 1, borderColor: theme.ink(0x66) },
                      ]}
                    />
                  )}
                  <Text style={styles.metaText}>
                    {[
                      scheduled ? (met ? 'Goal met' : 'Goal not met') : '',
                      minute === undefined ? '' : time(minute),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        );
      }}
      ListEmptyComponent={
        <Text style={styles.empty}>
          {selectedLabel
            ? `No days with ${selectedLabel} in this period.`
            : 'Nothing recorded in this period.'}
        </Text>
      }
      ListFooterComponent={
        <View style={{ paddingTop: 20 }}>
          <InfoNote
            label="How recording statistics work"
            text="Recording counts use all calendar days since the start. Success counts use scheduled days and the goal effective on each date. Off-days leave success streaks intact; logging streaks require consecutive calendar entries. An unfinished today has a streak grace period. Use the arrows beside the dates to step back through earlier periods. Future and pre-start entries are kept, but excluded from statistics."
          />
        </View>
      }
    />
  );
});
const useStyles = themedStyles((t) => ({
  body: {
    paddingHorizontal: 20,
    paddingTop: 8,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  header: { gap: 22, paddingBottom: 4 },
  month: {
    color: t.ink(0x8a),
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingTop: 18,
    paddingBottom: 6,
  },
  entry: {
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.ink(0x22),
  },
  when: { width: 38, alignItems: 'center', paddingTop: 1 },
  dayNumber: {
    color: t.ink(0xe4),
    fontSize: 19,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  weekday: { color: t.ink(0x7e), fontSize: 11 },
  entryText: { color: t.ink(0xd6), fontSize: 15, lineHeight: 22 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontSize: 13, fontWeight: '600' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  goalDot: { width: 7, height: 7, borderRadius: 4 },
  metaText: { color: t.ink(0x7e), fontSize: 12 },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
  },
  filterText: { fontSize: 13, fontWeight: '600' },
  empty: { color: t.ink(0x8e), fontSize: 13, paddingVertical: 12 },
}));
