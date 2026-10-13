import { PeriodProgress } from './PeriodProgress';
import type { EntryValues } from '@onpurpose/core/entries';
import { GoalSummary } from './GoalSummary';
import { Text, useAppWindowDimensions } from './Typography';
import {
  weekDayOrder,
  type WeekStart,
} from '@onpurpose/core/displayPreferences';
import { memo, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
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
  formatStatistic as format,
  statisticDateLabel as dateLabel,
  statisticSpanLabel,
} from '@onpurpose/core/statisticsFormatting';
import type { Habit } from '@onpurpose/core/habits';
import type { HistoryAction, StoredEvent } from '@onpurpose/core/storage/model';
import { timeOfDayStatistics } from '@onpurpose/core/timeOfDay';
import { TimeOfDayChart } from './TimeOfDayChart';
import {
  dateKey,
  dayNumber,
  habitStatistics,
  habitTrackingStart,
  type StatsRange,
} from '@onpurpose/core/statistics';
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
  valueUnit,
} from '@onpurpose/core/statsSeries';
import { ValueChart } from './ValueChart';
import { SuccessChart } from './SuccessChart';
import { StreakChart } from './StreakChart';
import { StatsCalendar } from './StatsCalendar';
import { InfoNote } from './InfoNote';
import type { EntryDay } from '@onpurpose/core/calendar';
import { useSheetScroll } from './SheetModal';
import { useTheme } from './ThemeContext';

export const HabitStatsScreen = memo(function HabitStatsScreen({
  habit,
  weekStart,
  values,
  events,
  actions,
  today,
  onCellPress,
  editable,
  bottomInset = 40,
  onGoalEdit,
}: {
  habit: Habit;
  weekStart: WeekStart;
  values: EntryValues;
  events: StoredEvent[];
  actions: HistoryAction[];
  today: string;
  onCellPress: (habit: Habit, day: EntryDay) => void;
  editable: boolean;
  bottomInset?: number;
  onGoalEdit: () => void;
}) {
  const theme = useTheme();
  const statsStyles = useStatsStyles();
  const colour = theme.colour(habit.color);
  const { fontScale } = useAppWindowDimensions();
  const [range, setRange] = useState<StatsRange>(30);
  const [offset, setOffset] = useState(0);
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
    () => habitStatistics(habit, values, events, today, range, end),
    [habit, values, events, today, range, end],
  );
  // Whole history for trends and streaks; the window for everything shown.
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
  const weekDays = weekDayOrder(weekStart);
  const unit = habit.unit ?? '';
  const sheetScroll = useSheetScroll();
  const goalShown = stats.completion.active || stats.completion.eligible > 0;
  const plural = (count: number, noun = 'day') =>
    `${count} ${count === 1 ? noun : `${noun}s`}`;
  const withUnit = (value: number | null) =>
    `${format(value)}${unit ? ` ${unit}` : ''}`;
  const periodNoun = period?.unit === 'week' ? 'weeks' : 'periods';
  const tiles: StatTile[] = [];
  if (stats.numeric) {
    if (goalShown)
      tiles.push({
        label: stats.periodGoals.current
          ? 'Days meeting the daily condition'
          : 'Days meeting the goal',
        value: stats.completion.eligible
          ? `${stats.completion.successes} of ${stats.completion.eligible}`
          : '—',
      });
    tiles.push(
      { label: 'Average per day', value: withUnit(stats.average) },
      {
        label: 'Best day',
        value: withUnit(stats.recorded ? stats.best : null),
      },
    );
  }
  if (!stats.periodGoals.current)
    tiles.push(
      ...streakTiles(
        tiles.length,
        stats.numeric && !stats.completion.active
          ? 'Days recorded in a row'
          : 'Current streak',
        stats.streak,
        stats.bestStreak,
      ),
    );
  const trendNow = trend.findLast((value) => value !== null);
  const longestRun = visibleRuns.reduce<(typeof runs)[number] | null>(
    (best, run) => (!best || run.length >= best.length ? run : best),
    null,
  );
  const changeRange = (next: StatsRange) => {
    setRange(next);
    setOffset(0);
  };
  return (
    <ScrollView
      {...sheetScroll}
      testID="habit-statistics"
      alwaysBounceVertical
      directionalLockEnabled
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={[statsStyles.body, { paddingBottom: bottomInset }]}
      showsVerticalScrollIndicator={false}
    >
      <RangePicker range={range} onChange={changeRange} />
      <View style={statsStyles.overview}>
        <PeriodNavigator
          label={
            stats.eligible
              ? statisticSpanLabel(dateKey(from), end, today)
              : `Starts ${dateLabel(stats.trackingStart, true)}`
          }
          canGoBack={window.canGoBack}
          canGoForward={window.canGoForward}
          onStep={(delta) =>
            setOffset((previous) => Math.max(0, previous - delta))
          }
        />
        <Text style={statsStyles.headline}>
          {stats.numeric
            ? stats.recorded
              ? withUnit(stats.total)
              : 'Nothing recorded'
            : stats.eligible
              ? `${stats.successes} of ${plural(stats.eligible)}`
              : 'No days yet'}
        </Text>
        <Text style={statsStyles.headlineNote}>
          {stats.numeric
            ? stats.recorded
              ? `Recorded on ${stats.recorded} of ${plural(stats.eligible)}`
              : 'Your records will appear here.'
            : stats.rate === null
              ? 'Your records will appear here.'
              : `${Math.round(stats.rate * 100)}% successful`}
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
        <PeriodProgress data={stats.periodGoals} colour={colour} />
      )}
      {stats.numeric && (
        <StatsSection
          title={valueUnit(span) === 'day' ? 'Daily totals' : 'Average per day'}
          subtitle={stats.recorded ? null : 'Nothing recorded in this period'}
          info={
            valueUnit(span) === 'day'
              ? `Each bar is one day’s total. ${goalShown ? 'Bright bars met that day’s goal, faded bars missed it, and grey bars were on days off. The dashed line (or band) is the goal.' : 'Add a goal to colour days by success.'} Tap a bar to see it, then step with the arrows.`
              : `Each bar is the average per day for a ${valueUnit(span)}, counting blank days as zero, so it compares with the daily goal line.${goalShown ? ' Brighter bars met the goal on more of their scheduled days.' : ''} Tap a bar to see its total.`
          }
        >
          <ValueChart
            key={`${habit.id}:${range}:${offset}`}
            habit={habit}
            bins={binSeries(habit, days, valueUnit(span), weekStart)}
            unit={valueUnit(span)}
            from={from}
            to={window.to}
            today={today}
            weekStart={weekStart}
          />
        </StatsSection>
      )}
      <StatsSection
        title={mode === 'recording' ? 'Days recorded' : 'Success over time'}
        subtitle={
          trendNow === undefined || trendNow === null
            ? null
            : `Trend ${Math.round(trendNow * 100)}%${offset ? ` on ${dateLabel(end)}` : ''}`
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
          colour={colour}
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
          colour={colour}
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
          stats.numeric
            ? 'Tap a day to edit its total. Bright days met their goal and faded days missed it; without a goal, brightness follows the total. Successful days in a row join into one bar, bridged across days off.'
            : 'Tap a day to check or uncheck it. Successful days are coloured and join into one bar while the streak lasts, bridged across days off.'
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
        />
      </StatsSection>
      <StatsSection
        title="By day of the week"
        info={
          stats.numeric
            ? `Average ${unit || 'total'} per day for each weekday in the selected period. Blank days count as zero.`
            : 'Share of each weekday’s scheduled days that were successful in the selected period.'
        }
      >
        {weekDays.map((weekday) => {
          const day = stats.weekday.find((item) => item.day === weekday)!;
          const maximum = stats.numeric
            ? Math.max(1, ...stats.weekday.map((item) => item.value ?? 0))
            : 100;
          const label = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
            day.day
          ];
          return (
            <View
              key={day.day}
              accessible
              accessibilityLabel={`${label}, ${day.value === null ? 'no records' : `${format(day.value)}${stats.numeric ? ` ${unit}` : '%'}`}`}
              style={statsStyles.bar}
            >
              <Text
                style={[
                  statsStyles.small,
                  { width: 34 * Math.max(1, fontScale) },
                ]}
              >
                {label}
              </Text>
              <View style={statsStyles.track}>
                <View
                  style={{
                    width: `${Math.max(0, ((day.value ?? 0) / maximum) * 100)}%`,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: colour,
                  }}
                />
              </View>
              <Text
                style={[
                  statsStyles.small,
                  { minWidth: 52, textAlign: 'right' },
                ]}
              >
                {format(day.value)}
                {day.value !== null && !stats.numeric ? '%' : ''}
              </Text>
            </View>
          );
        })}
      </StatsSection>
      <TimeOfDayChart
        key={`${habit.id}:${range}:${offset}`}
        stats={timeOfDay}
        colour={colour}
      />
      <InfoNote
        label="How statistics work"
        text={`${
          stats.numeric
            ? 'Averages divide totals by calendar days since the start, including today and blank days. Blanks stay empty; zero is a recorded total. A logging streak counts consecutive days with an entry.'
            : 'Success rates use scheduled days since the start, including today. Off-days do not break a success streak; an unfinished today has a grace period.'
        } Success uses each day’s effective goal and schedule, with blank days never successful. Use the arrows beside the dates to step back through earlier periods. Future entries and records before the start date are excluded from charts and statistics. Earlier records stay saved; edit the start date to include them.`}
      />
    </ScrollView>
  );
});
