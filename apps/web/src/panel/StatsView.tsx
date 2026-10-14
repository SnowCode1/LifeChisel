import { useMemo, useState, type ReactNode } from 'react';
import {
  weekDayOrder,
  type WeekStart,
} from '@onpurpose/core/displayPreferences';
import { entryLabel, type EntryValues } from '@onpurpose/core/entries';
import { habitType, isNumericHabit, type Habit } from '@onpurpose/core/habits';
import { periodMet, periodSummary } from '@onpurpose/core/goalTiming';
import type { PeriodResult } from '@onpurpose/core/periodStatistics';
import {
  dateKey,
  dayNumber,
  habitStatistics,
  habitTrackingStart,
  type StatsRange,
} from '@onpurpose/core/statistics';
import { recordStatistics } from '@onpurpose/core/recordStatistics';
import {
  binSeries,
  habitSeries,
  observations,
  smoothedRates,
  statsWindow,
  streakRuns,
  successMode,
  successUnit,
  TREND_MINIMUM_WEIGHT,
  TREND_SIGMA_DAYS,
  valueUnit,
} from '@onpurpose/core/statsSeries';
import {
  formatStatistic as format,
  statisticDateLabel,
  statisticMonthLabel,
  statisticSpanLabel,
} from '@onpurpose/core/statisticsFormatting';
import { timeOfDayStatistics } from '@onpurpose/core/timeOfDay';
import { categoryColours } from '@onpurpose/core/categoryColours';
import { habitSummary } from '@onpurpose/core/habitSummary';
import type { HistoryAction, StoredEvent } from '@onpurpose/core/storage/model';
import type { Theme } from '@onpurpose/core/theme';
import {
  CategoryRows,
  StreakChart,
  SuccessChart,
  TimeOfDayChart,
  ValueChart,
  WeekdayBars,
} from './charts.tsx';
import { StatsCalendar } from './StatsCalendar.tsx';

const RANGES: { value: StatsRange; label: string }[] = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: 'Year' },
  { value: 'all', label: 'All time' },
];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
type Tile = { label: string; value: string };

// Statistics for one habit, computed by the same core functions as the
// phone's screens; only the drawing is the web's own.
export function StatsView({
  habit,
  values,
  events,
  actions,
  today,
  weekStart,
  theme,
  editable,
  onDay,
}: {
  habit: Habit;
  values: EntryValues;
  events: StoredEvent[];
  actions: HistoryAction[];
  today: string;
  weekStart: WeekStart;
  theme: Theme;
  editable: boolean;
  onDay: (
    habit: Habit,
    date: string,
    label: string,
    anchor: HTMLElement,
  ) => void;
}) {
  const colour = theme.colour(habit.color);
  const [range, setRange] = useState<StatsRange>(30);
  const [offset, setOffset] = useState(0);
  const [category, setCategory] = useState<string | null>(null);
  const record =
    habitType(habit) === 'categorical' || habitType(habit) === 'text';
  const numeric = isNumericHabit(habit);
  const trackingStart = useMemo(
    () => habitTrackingStart(habit, values, events, today),
    [habit, values, events, today],
  );
  const window = statsWindow(range, offset, trackingStart, today);
  const from = window.shown,
    end = dateKey(window.to),
    span = window.to - from + 1;
  const habitStats = useMemo(
    () =>
      record ? null : habitStatistics(habit, values, events, today, range, end),
    [record, habit, values, events, today, range, end],
  );
  const recordStats = useMemo(
    () =>
      record
        ? recordStatistics(habit, values, events, today, range, end)
        : null,
    [record, habit, values, events, today, range, end],
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
  const timeOfDay = useMemo(
    () => timeOfDayStatistics(habit, values, actions, dateKey(from), end),
    [habit, values, actions, from, end],
  );
  const colours = useMemo(() => categoryColours(habit, theme), [habit, theme]);

  const plural = (count: number, noun = 'day') =>
    `${count} ${count === 1 ? noun : `${noun}s`}`;
  const unit = habit.unit ?? '';
  const withUnit = (value: number | null) =>
    `${format(value)}${unit ? ` ${unit}` : ''}`;
  const periodNoun = period?.unit === 'week' ? 'weeks' : 'periods';
  const streakTiles = (
    existing: number,
    label: string,
    current: number,
    longest: number,
  ): Tile[] =>
    existing % 2 === 1
      ? [
          {
            label: `${label} · longest ${plural(longest)}`,
            value: plural(current),
          },
        ]
      : [
          { label, value: plural(current) },
          {
            label: label.startsWith('Current')
              ? 'Longest streak'
              : `Longest · ${label.toLowerCase()}`,
            value: plural(longest),
          },
        ];

  // Headline, note and tiles: the phone's rules for each kind of habit.
  let headline: string, note: string;
  const tiles: Tile[] = [];
  const stats = habitStats ?? recordStats!;
  const periodGoals = stats.periodGoals;
  if (habitStats) {
    const goalShown =
      habitStats.completion.active || habitStats.completion.eligible > 0;
    headline = numeric
      ? habitStats.recorded
        ? withUnit(habitStats.total)
        : 'Nothing recorded'
      : habitStats.eligible
        ? `${habitStats.successes} of ${plural(habitStats.eligible)}`
        : 'No days yet';
    note = numeric
      ? habitStats.recorded
        ? `Recorded on ${habitStats.recorded} of ${plural(habitStats.eligible)}`
        : 'Your records will appear here.'
      : habitStats.rate === null
        ? 'Your records will appear here.'
        : `${Math.round(habitStats.rate * 100)}% successful`;
    if (numeric) {
      if (goalShown)
        tiles.push({
          label: periodGoals.current
            ? 'Days meeting the daily condition'
            : 'Days meeting the goal',
          value: habitStats.completion.eligible
            ? `${habitStats.completion.successes} of ${habitStats.completion.eligible}`
            : '—',
        });
      tiles.push(
        { label: 'Average per day', value: withUnit(habitStats.average) },
        {
          label: 'Best day',
          value: withUnit(habitStats.recorded ? habitStats.best : null),
        },
      );
    }
    if (!periodGoals.current)
      tiles.push(
        ...streakTiles(
          tiles.length,
          numeric && !habitStats.completion.active
            ? 'Days recorded in a row'
            : 'Current streak',
          habitStats.streak,
          habitStats.bestStreak,
        ),
      );
  } else {
    const r = recordStats!;
    const goalShown = r.completion.active || r.completion.eligible > 0;
    headline = goalShown
      ? `${r.completion.successes} of ${plural(r.completion.eligible)}`
      : `${r.recorded} of ${plural(r.eligible)}`;
    note = goalShown
      ? periodGoals.current
        ? 'Meeting the daily condition'
        : 'Meeting the goal'
      : 'Recorded';
    const sameDays =
      r.recorded === r.completion.successes &&
      r.eligible === r.completion.eligible;
    const sameStreaks =
      r.streak === r.completion.streak &&
      r.bestStreak === r.completion.bestStreak;
    if (goalShown && !sameDays)
      tiles.push({
        label: 'Days recorded',
        value: `${r.recorded} of ${r.eligible}`,
      });
    const goalStreaks = goalShown && !periodGoals.current;
    if (goalStreaks)
      tiles.push(
        ...streakTiles(
          tiles.length + (sameStreaks ? 0 : 1),
          'Current streak',
          r.completion.streak,
          r.completion.bestStreak,
        ),
      );
    if (!goalStreaks || !sameStreaks)
      tiles.push(
        ...streakTiles(
          tiles.length,
          'Days recorded in a row',
          r.streak,
          r.bestStreak,
        ),
      );
  }
  const trendNow = trend.findLast((value) => value !== null);
  const visibleRuns = runs.filter(
    (run) => run.to >= from && run.from <= window.to,
  );
  const longestRun = visibleRuns.reduce<(typeof runs)[number] | null>(
    (best, run) => (!best || run.length >= best.length ? run : best),
    null,
  );
  const eligible = habitStats ? habitStats.eligible : recordStats!.eligible;

  return (
    <div className="stats">
      <div className="segmented" role="tablist" aria-label="Range">
        {RANGES.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            role="tab"
            aria-selected={range === option.value}
            onClick={() => {
              setRange(option.value);
              setOffset(0);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="stats-overview">
        <div className="period-navigator">
          <button
            type="button"
            className="icon-button"
            aria-label="Earlier period"
            disabled={!window.canGoBack}
            onClick={() => setOffset((value) => value + 1)}
          >
            ‹
          </button>
          <span>
            {eligible
              ? statisticSpanLabel(dateKey(from), end, today)
              : `Starts ${statisticDateLabel(trackingStart, true)}`}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Later period"
            disabled={!window.canGoForward}
            onClick={() => setOffset((value) => Math.max(0, value - 1))}
          >
            ›
          </button>
        </div>
        <p className="stats-headline">{headline}</p>
        <p className="muted">{note}</p>
      </div>
      {tiles.length > 0 && (
        <div className="tiles">
          {tiles.map((tile) => (
            <div key={tile.label} className="tile">
              <span className="muted">{tile.label}</span>
              <strong>{tile.value}</strong>
            </div>
          ))}
        </div>
      )}
      <p className="goal-line">
        <span className="muted">Goal</span> {habitSummary(habit, values, today)}
      </p>
      {offset === 0 && <PeriodProgress data={periodGoals} colour={colour} />}

      {numeric && habitStats && (
        <Section
          title={valueUnit(span) === 'day' ? 'Daily totals' : 'Average per day'}
          subtitle={
            habitStats.recorded ? null : 'Nothing recorded in this period'
          }
          info={
            valueUnit(span) === 'day'
              ? 'Each bar is one day’s total. Bright bars met that day’s goal, faded bars missed it, and grey bars were on days off. The dashed line is the goal.'
              : `Each bar is the average per day for a ${valueUnit(span)}, counting blank days as zero, so it compares with the daily goal line.`
          }
        >
          <ValueChart
            key={`${range}:${offset}`}
            habit={habit}
            colour={colour}
            theme={theme}
            bins={binSeries(habit, days, valueUnit(span), weekStart)}
            unit={valueUnit(span)}
            from={from}
            to={window.to}
            today={today}
            weekStart={weekStart}
          />
        </Section>
      )}
      {habitType(habit) === 'categorical' && (
        <Section
          title="Categories"
          subtitle={
            category
              ? `Showing ${habit.categories?.find((option) => option.id === category)?.label} · select again for all`
              : null
          }
          info="Each row shows the days that category was chosen in this period; the number counts them. Several categories can share a day, so rows never add up. Select a row to show only that category in the calendar and entries."
        >
          <CategoryRows
            habit={habit}
            days={days}
            colours={colours}
            selected={category}
            onSelect={setCategory}
          />
        </Section>
      )}
      <Section
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
              ? 'Columns show the share of days with an entry. The line smooths that share over about two weeks either side. Today counts once it’s recorded.'
              : 'Columns show the share of scheduled days that met the goal. The line smooths success over about two weeks either side. Days off don’t count, and today counts once it’s done.'
        }
      >
        <SuccessChart
          key={`${range}:${offset}`}
          colour={colour}
          theme={theme}
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
      </Section>
      <Section
        title="Streaks"
        subtitle={
          longestRun
            ? `Longest here: ${plural(longestRun.length, mode === 'period' ? periodNoun.replace(/s$/, '') : 'day')}, ${statisticSpanLabel(dateKey(longestRun.from), dateKey(longestRun.to), today)}`
            : 'No streak in this period'
        }
        info={
          mode === 'period'
            ? 'Each bar is a streak of finished periods in a row that met their target; rest periods hold it and a missed period breaks it.'
            : mode === 'recording'
              ? 'Each bar is a streak of days in a row with an entry; a day without one breaks it, and an unfinished today keeps it.'
              : 'Each bar is a streak of successful scheduled days in a row, carried across days off; a missed day breaks it, and an unfinished today keeps it.'
        }
      >
        <StreakChart
          key={`${range}:${offset}`}
          colour={colour}
          theme={theme}
          runs={runs}
          noun={mode === 'period' ? periodNoun : 'days'}
          from={from}
          to={window.to}
          today={today}
          weekStart={weekStart}
        />
      </Section>
      <Section
        title="Calendar"
        info={
          habitType(habit) === 'checkbox'
            ? 'Select a day to check or uncheck it. Successful days join into one bar while the streak lasts, bridged across days off.'
            : 'Select a day to edit its entry. Bright days met their goal and faded days missed it; without a goal, brightness follows the value.'
        }
      >
        <StatsCalendar
          key={`${range}:${offset}`}
          habit={habit}
          days={days}
          from={from}
          to={window.to}
          today={today}
          weekStart={weekStart}
          colour={colour}
          theme={theme}
          editable={editable}
          highlight={category}
          categoryColours={colours}
          onDay={(date, label, anchor) => onDay(habit, date, label, anchor)}
        />
      </Section>
      {habitStats && (
        <Section
          title="By day of the week"
          info={
            numeric
              ? `Average ${unit || 'total'} per day for each weekday in the selected period. Blank days count as zero.`
              : 'Share of each weekday’s scheduled days that were successful in the selected period.'
          }
        >
          <WeekdayBars
            rows={weekDayOrder(weekStart).map((day) => ({
              day,
              label: WEEKDAY_NAMES[day],
              value:
                habitStats.weekday.find((item) => item.day === day)?.value ??
                null,
            }))}
            colour={colour}
            numeric={numeric}
            unit={unit}
          />
        </Section>
      )}
      {timeOfDay.recorded > 0 && (
        <Section
          title="Time of day"
          info="When entries were first filled in on their own day, from your change history. Entries filled in on a later day are not counted."
        >
          <TimeOfDayChart stats={timeOfDay} colour={colour} theme={theme} />
        </Section>
      )}
      {recordStats && (
        <Entries
          habit={habit}
          days={days}
          category={category}
          today={today}
          onDay={onDay}
          editable={editable}
        />
      )}
      <details className="info-note">
        <summary>How statistics work</summary>
        <p>
          {numeric
            ? 'Averages divide totals by calendar days since the start, including today and blank days. Blanks stay empty; zero is a recorded total.'
            : 'Success rates use scheduled days since the start, including today. Days off do not break a success streak; an unfinished today has a grace period.'}{' '}
          Success uses each day’s effective goal and schedule, with blank days
          never successful. Use the arrows beside the dates to step back through
          earlier periods. Future entries and records before the start date are
          excluded. Earlier records stay saved; edit the start date to include
          them.
        </p>
      </details>
    </div>
  );
}

function Section({
  title,
  subtitle,
  info,
  children,
}: {
  title: string;
  subtitle?: string | null;
  info: string;
  children: ReactNode;
}) {
  return (
    <section className="stats-section">
      <header>
        <h3>{title}</h3>
        <details className="info">
          <summary aria-label={`About ${title.toLowerCase()}`}>i</summary>
          <p>{info}</p>
        </details>
      </header>
      {subtitle && <p className="muted">{subtitle}</p>}
      {children}
    </section>
  );
}

// Progress in the open quota period, and finished periods on request.
function PeriodProgress({
  data,
  colour,
}: {
  data: {
    current: PeriodResult | null;
    recent: PeriodResult[];
    eligible: number;
    met: number;
    streak: number;
    bestStreak: number;
  };
  colour: string;
}) {
  if (!data.current && !data.recent.length) return null;
  const label = (date: string) => statisticDateLabel(date);
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
    <div className="period-progress">
      {data.current && (
        <div>
          <p className="period-heading">
            <strong>
              {data.current.count} {data.current.count === 1 ? 'day' : 'days'}{' '}
              so far
            </strong>
            <span style={{ color: colour }}>{status(data.current)}</span>
          </p>
          <p className="muted">
            {periodSummary(data.current.period)} · {label(data.current.start)} –{' '}
            {label(data.current.end)}
          </p>
        </div>
      )}
      <details>
        <summary>
          {data.eligible
            ? `Goal met in ${data.met} of ${data.eligible} finished periods`
            : 'No finished periods yet'}
        </summary>
        <p className="muted">
          Period streak {data.streak} · longest {data.bestStreak} (all time)
        </p>
        {data.recent.map((row) => (
          <p key={row.id}>
            {label(row.start)} – {label(row.end)}
            <span className="muted">
              {' '}
              · {row.count} days · {status(row)}
            </span>
          </p>
        ))}
      </details>
    </div>
  );
}

// The journal for text and category habits: newest first, grouped by month.
function Entries({
  habit,
  days,
  category,
  today,
  editable,
  onDay,
}: {
  habit: Habit;
  days: ReturnType<typeof habitSeries>;
  category: string | null;
  today: string;
  editable: boolean;
  onDay: (
    habit: Habit,
    date: string,
    label: string,
    anchor: HTMLElement,
  ) => void;
}) {
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
  const months = new Map<string, typeof entries>();
  for (const item of entries) {
    const key = item.date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), item]);
  }
  return (
    <section className="stats-section">
      <header>
        <h3>Entries</h3>
      </header>
      {!entries.length && <p className="muted">No entries in this period.</p>}
      {[...months].map(([key, items]) => (
        <div key={key} className="journal-month">
          <p className="muted">
            {statisticMonthLabel(`${key}-01`)} · {items.length}
          </p>
          {items.map((item) => (
            <button
              key={item.date}
              type="button"
              className="journal-entry"
              disabled={!editable}
              onClick={(event) =>
                onDay(
                  habit,
                  item.date,
                  statisticDateLabel(
                    item.date,
                    item.date.slice(0, 4) !== today.slice(0, 4),
                  ),
                  event.currentTarget,
                )
              }
            >
              <span className="muted">{statisticDateLabel(item.date)}</span>
              <span>{entryLabel(habit, item.value)}</span>
            </button>
          ))}
        </div>
      ))}
    </section>
  );
}
